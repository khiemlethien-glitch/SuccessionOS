using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Caching.Memory;

namespace SuccessionOS.Infrastructure.VnrHre;

// ─── Public DTOs (field names khớp với schema SuccessionOS) ───────────────────

public record VnrProfile(
    string Id,
    string Name,
    string? OrgStructureId,
    string? JobTitleId,
    string? Email,
    DateTime? DateCreate);

public record VnrContractEvaResult(string ProfileId, double TotalScore, DateTime EvaluationDate);
public record VnrPromotion(string ProfileId, DateTime EffectiveDate);
public record VnrContract(string ProfileId, DateTime ExpiryDate, string ContractType);

// ─── VnR response envelope ─────────────────────────────────────────────────────
// VnR dùng pascal-case "Data" wrapper
file record VnrEnvelope<T>(List<T>? Data, string? Status, string? Message);

// ─── VnR list item DTOs (tên field khớp chính xác với VnR response JSON) ──────

/// Cat_OrgStructure/list → { orgId, orgCode, orgName, orgDescription }
file record VnrOrgItem(
    [property: JsonPropertyName("orgId")]   string? OrgId,
    [property: JsonPropertyName("orgName")] string? OrgName);

/// Cat_JobTitle/list → { titleId, titleCode, titleName, titleDescription }
file record VnrJobTitleItem(
    [property: JsonPropertyName("titleId")]   string? TitleId,
    [property: JsonPropertyName("titleName")] string? TitleName);

// ─── JsonSerializerOptions dùng chung ─────────────────────────────────────────
file static class VnrJson
{
    // Case-insensitive để xử lý cả PascalCase lẫn camelCase từ VnR
    public static readonly JsonSerializerOptions Opts = new()
    {
        PropertyNameCaseInsensitive = true,
    };
}

/// <summary>
/// Thin client cho VnR HRE API.
/// Token được inject tự động bởi VnrAuthHandler (forward từ Angular OIDC JWT).
/// </summary>
public class VnrHreClient(HttpClient http)
{
    private static readonly object ListBody = new { pageIndex = 1, pageSize = 9999 };

    // ─── Sync endpoints ──────────────────────────────────────────────────────

    public Task<List<VnrContractEvaResult>> GetContractEvaResultsAsync(CancellationToken ct)
        => PostListAsync<VnrContractEvaResult>("/api/v1/HR_ContractEvaResult/list", ct);

    public Task<List<VnrPromotion>> GetPromotionsAsync(CancellationToken ct)
        => PostListAsync<VnrPromotion>("/api/v1/Hre_Promotion/list", ct);

    public Task<List<VnrContract>> GetContractsAsync(CancellationToken ct)
        => PostListAsync<VnrContract>("/api/v1/HR_Contract/list", ct);

    // ─── Employee endpoints ───────────────────────────────────────────────────

    public Task<List<VnrProfile>> GetProfilesAsync(CancellationToken ct)
        => GetAsync<VnrProfile>("/api/v1/Hre_Profile", ct);

    public Task<List<VnrProfile>> GetProfilesCachedAsync(IMemoryCache cache, CancellationToken ct)
        => cache.GetOrCreateAsync("vnr_profiles", async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5);
            return await GetProfilesAsync(ct);
        })!.ContinueWith(t => t.Result ?? new List<VnrProfile>(), TaskScheduler.Default);

    /// <summary>
    /// Thử endpoint GetProfileDetailById trước, fallback cached full list.
    /// </summary>
    public async Task<VnrProfile?> GetProfileByIdAsync(string id, IMemoryCache cache, CancellationToken ct)
    {
        try
        {
            var resp = await http.PostAsJsonAsync("/api/v1/Hre_Profile/GetProfileDetailById", new { id }, ct);
            resp.EnsureSuccessStatusCode();
            var envelope = await resp.Content.ReadFromJsonAsync<VnrEnvelope<VnrProfile>>(VnrJson.Opts, cancellationToken: ct);
            var profile = envelope?.Data?.FirstOrDefault();
            if (profile != null) return profile;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[VnrHre] GetProfileDetailById failed ({ex.Message}) — fallback to list");
        }

        var all = await GetProfilesCachedAsync(cache, ct);
        return all.FirstOrDefault(p => p.Id == id);
    }

    // ─── Lookup endpoints ─────────────────────────────────────────────────────

    public Task<Dictionary<string, string>> GetOrgLookupAsync(IMemoryCache cache, CancellationToken ct)
        => cache.GetOrCreateAsync("vnr_org", async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10);
            try
            {
                var items = await PostListAsync<VnrOrgItem>("/api/v1/Cat_OrgStructure/list", ct);
                var dict  = items
                    .Where(x => !string.IsNullOrEmpty(x.OrgId))
                    .ToDictionary(x => x.OrgId!, x => x.OrgName ?? "");
                Console.WriteLine($"[VnrHre] OrgStructure loaded: {dict.Count} entries");
                return dict;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[VnrHre] OrgStructure lookup failed: {ex.Message} — retry in 1 min");
                entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(1);
                return new Dictionary<string, string>();
            }
        }) ?? Task.FromResult(new Dictionary<string, string>());

    public Task<Dictionary<string, string>> GetJobTitleLookupAsync(IMemoryCache cache, CancellationToken ct)
        => cache.GetOrCreateAsync("vnr_jobtitle", async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10);
            try
            {
                var items = await PostListAsync<VnrJobTitleItem>("/api/v1/Cat_JobTitle/list", ct);
                var dict  = items
                    .Where(x => !string.IsNullOrEmpty(x.TitleId))
                    .ToDictionary(x => x.TitleId!, x => x.TitleName ?? "");
                Console.WriteLine($"[VnrHre] JobTitle loaded: {dict.Count} entries");
                return dict;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[VnrHre] JobTitle lookup failed: {ex.Message} — retry in 1 min");
                entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(1);
                return new Dictionary<string, string>();
            }
        }) ?? Task.FromResult(new Dictionary<string, string>());

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private async Task<List<T>> GetAsync<T>(string path, CancellationToken ct)
    {
        try
        {
            var resp = await http.GetAsync(path, ct);
            resp.EnsureSuccessStatusCode();
            var envelope = await resp.Content.ReadFromJsonAsync<VnrEnvelope<T>>(VnrJson.Opts, cancellationToken: ct);
            return envelope?.Data ?? new();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[VnrHre] GET {path} failed: {ex.Message}");
            return new List<T>();
        }
    }

    private async Task<List<T>> PostListAsync<T>(string path, CancellationToken ct)
    {
        try
        {
            var resp = await http.PostAsJsonAsync(path, ListBody, ct);
            resp.EnsureSuccessStatusCode();
            var envelope = await resp.Content.ReadFromJsonAsync<VnrEnvelope<T>>(VnrJson.Opts, cancellationToken: ct);
            return envelope?.Data ?? new();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[VnrHre] POST {path} failed: {ex.Message}");
            return new List<T>();
        }
    }
}
