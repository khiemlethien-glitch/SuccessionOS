using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Caching.Memory;

namespace SuccessionOS.Infrastructure.VnrHre;

// ─── SCC Public DTOs ─────────────────────────────────────────────────────────

/// Kết quả từ NineBoxProfile/list — vị trí Nine-Box của từng nhân viên
public record SccNineBoxItem(
    [property: JsonPropertyName("profileId")]        string? ProfileId,
    [property: JsonPropertyName("performanceName")]  string? PerformanceName,   // "Thấp"|"Trung bình"|"Xuất sắc"
    [property: JsonPropertyName("potentialName")]    string? PotentialName,     // same scale
    [property: JsonPropertyName("nineBoxName")]      string? NineBoxName,       // label của ô nine-box
    [property: JsonPropertyName("performanceId")]    string? PerformanceId,     // fallback numeric key
    [property: JsonPropertyName("potentialId")]      string? PotentialId);

/// Kết quả từ TalentProfile/list — nhãn nhân tài (Tier) + readiness
public record SccTalentTagItem(
    [property: JsonPropertyName("profileId")]           string? ProfileId,
    [property: JsonPropertyName("talentTagName")]       string? TalentTagName,       // "Nòng cốt"|"Tiềm năng"|"Kế thừa"
    [property: JsonPropertyName("readinessLevelName")]  string? ReadinessLevelName,  // "Sẵn sàng ngay"|"1-2 năm"|"3+ năm"
    [property: JsonPropertyName("talentTagId")]         string? TalentTagId,
    [property: JsonPropertyName("readinessLevelId")]    string? ReadinessLevelId);

/// Kết quả từ SCC_Candidate/list — ứng viên kế thừa gắn với vị trí
public record SccCandidateItem(
    [property: JsonPropertyName("profileId")]           string? ProfileId,
    [property: JsonPropertyName("positionId")]          string? PositionId,
    [property: JsonPropertyName("positionName")]        string? PositionName,
    [property: JsonPropertyName("readinessLevelName")]  string? ReadinessLevelName);

// ─── Internal envelope ────────────────────────────────────────────────────────
file record SccEnvelope<T>(List<T>? Data, string? Status, string? Message);

file static class SccJson
{
    public static readonly JsonSerializerOptions Opts = new()
    {
        PropertyNameCaseInsensitive = true,
    };
}

/// <summary>
/// Client cho VnR SCC API (port 7063).
/// Cung cấp dữ liệu Tier (TalentTag), Readiness, Nine-Box thực tế từ VnR.
/// Dùng cùng VnrAuthHandler để forward JWT.
/// </summary>
public class VnrSccClient(HttpClient http)
{
    private static readonly object ListBody = new { pageIndex = 1, pageSize = 9999 };

    // ── Bulk list endpoints ──────────────────────────────────────────────────

    /// Nine-box positions for all profiles (performance + potential axis)
    public Task<List<SccNineBoxItem>> GetNineBoxProfilesAsync(CancellationToken ct)
        => PostListAsync<SccNineBoxItem>("/api/v1/NineBoxProfile/list", ct);

    /// Talent tag (Tier) + readiness per profile
    public Task<List<SccTalentTagItem>> GetTalentTagLinksAsync(CancellationToken ct)
        => PostListAsync<SccTalentTagItem>("/api/v1/TalentProfile/list", ct);

    /// Succession candidates linked to positions (với readiness per position)
    public Task<List<SccCandidateItem>> GetCandidatesAsync(CancellationToken ct)
        => PostListAsync<SccCandidateItem>("/api/v1/SCC_Candidate/list", ct);

    // ── Cached lookups (5 phút) ──────────────────────────────────────────────

    public Task<Dictionary<string, SccNineBoxItem>> GetNineBoxLookupAsync(
        IMemoryCache cache, CancellationToken ct)
        => cache.GetOrCreateAsync("scc_ninebox", async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5);
            try
            {
                var items = await GetNineBoxProfilesAsync(ct);
                var dict  = items
                    .Where(x => !string.IsNullOrEmpty(x.ProfileId))
                    .GroupBy(x => x.ProfileId!)
                    .ToDictionary(g => g.Key, g => g.First());
                Console.WriteLine($"[VnrScc] NineBoxProfile loaded: {dict.Count} entries");
                return dict;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[VnrScc] NineBoxProfile failed: {ex.Message}");
                entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(1);
                return new Dictionary<string, SccNineBoxItem>();
            }
        }) ?? Task.FromResult(new Dictionary<string, SccNineBoxItem>());

    public Task<Dictionary<string, SccTalentTagItem>> GetTalentTagLookupAsync(
        IMemoryCache cache, CancellationToken ct)
        => cache.GetOrCreateAsync("scc_talenttag", async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5);
            try
            {
                var items = await GetTalentTagLinksAsync(ct);
                var dict  = items
                    .Where(x => !string.IsNullOrEmpty(x.ProfileId))
                    .GroupBy(x => x.ProfileId!)
                    .ToDictionary(g => g.Key, g => g.First());
                Console.WriteLine($"[VnrScc] TalentTagLink loaded: {dict.Count} entries");
                return dict;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[VnrScc] TalentTagLink failed: {ex.Message}");
                entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(1);
                return new Dictionary<string, SccTalentTagItem>();
            }
        }) ?? Task.FromResult(new Dictionary<string, SccTalentTagItem>());

    // ── Score/label mappers ──────────────────────────────────────────────────

    /// VnR TalentTagName → internal tier string (Core/Potential/Successor)
    public static string? MapTier(string? tagName) =>
        tagName?.Trim().ToLowerInvariant() switch
        {
            "nòng cốt" or "nong cot" or "core"            => "Core",
            "tiềm năng" or "tiem nang" or "potential"
                or "high potential" or "tiềm năng cao"    => "Potential",
            "kế thừa" or "ke thua" or "successor"          => "Successor",
            _                                               => null
        };

    /// VnR ReadinessLevelName → internal readiness string
    public static string? MapReadiness(string? name) =>
        name?.Trim().ToLowerInvariant() switch
        {
            "sẵn sàng ngay" or "san sang ngay" or "ready now" or "sẵn sàng" => "Ready Now",
            "1-2 năm"  or "1-2 years" or "ready in 1-2 years"              => "1-2 Years",
            "3+ năm"   or "3+ years"  or "dài hạn" or "long term"          => "3+ Years",
            _                                                                => null
        };

    /// VnR NineBox axis level name → approximate score 0–100
    public static int? MapAxisScore(string? levelName) =>
        levelName?.Trim().ToLowerInvariant() switch
        {
            "3" or "cao" or "xuất sắc" or "vượt trội" or "high"
                or "exceed" or "outstanding"                       => 85,
            "2" or "trung bình" or "đạt" or "medium" or "meet"
                or "good" or "average"                            => 60,
            "1" or "thấp" or "chưa đạt" or "không đạt" or "low"
                or "below" or "needs improvement" or "cần cải thiện" => 25,
            _                                                      => null
        };

    // ── HTTP helpers ─────────────────────────────────────────────────────────

    private async Task<List<T>> PostListAsync<T>(string path, CancellationToken ct)
    {
        try
        {
            var resp = await http.PostAsJsonAsync(path, ListBody, ct);
            resp.EnsureSuccessStatusCode();
            var envelope = await resp.Content
                .ReadFromJsonAsync<SccEnvelope<T>>(SccJson.Opts, cancellationToken: ct);
            var data = envelope?.Data ?? new List<T>();
            Console.WriteLine($"[VnrScc] POST {path}: {data.Count} items");
            return data;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[VnrScc] POST {path} failed: {ex.Message}");
            return new List<T>();
        }
    }
}
