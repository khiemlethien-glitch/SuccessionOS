using Microsoft.EntityFrameworkCore;
using SuccessionOS.Domain.Entities;
using SuccessionOS.Infrastructure.Data;
using SuccessionOS.Infrastructure.VnrHre;

namespace SuccessionOS.Application.Services;

/// <summary>
/// Sync dữ liệu từ VnR HRE + SCC → EmployeeExtension table.
/// Nguồn dữ liệu theo độ ưu tiên:
///   1. SCC TalentTagName  → TalentTier (chính thức từ HR)
///   2. SCC NineBoxProfile → PerformanceScore / PotentialScore
///   3. HRE ContractEvaResult → PerformanceScore (fallback)
///   4. HRE Hre_Promotion / HR_Contract → PotentialScore / RiskScore (fallback)
///   isManualOverride = true → bỏ qua hoàn toàn
/// </summary>
public class EmployeeSyncService(
    SuccessionDbContext db,
    VnrHreClient vnr,
    VnrSccClient scc)
{
    public async Task<SyncResult> SyncAllAsync(CancellationToken ct = default)
    {
        // ── 1. Fetch từ VnR HRE ───────────────────────────────────────────────
        var profiles   = await vnr.GetProfilesAsync(ct);
        var evaResults = await SafeFetch(() => vnr.GetContractEvaResultsAsync(ct), "HR_ContractEvaResult");
        var promotions = await SafeFetch(() => vnr.GetPromotionsAsync(ct),         "Hre_Promotion");
        var contracts  = await SafeFetch(() => vnr.GetContractsAsync(ct),          "HR_Contract");

        // ── 2. Fetch từ VnR SCC ───────────────────────────────────────────────
        var sccNineBox     = await SafeFetch(() => scc.GetNineBoxProfilesAsync(ct),  "SCC NineBoxProfile");
        var sccTalentTags  = await SafeFetch(() => scc.GetTalentTagLinksAsync(ct),   "SCC TalentProfile");
        var sccCandidates  = await SafeFetch(() => scc.GetCandidatesAsync(ct),       "SCC SCC_Candidate");

        // ── 3. Index by profileId ──────────────────────────────────────────────
        var evaByProfile     = evaResults .GroupBy(e => e.ProfileId).ToDictionary(g => g.Key, g => g.OrderByDescending(e => e.EvaluationDate).First());
        var promoByProfile   = promotions .GroupBy(p => p.ProfileId).ToDictionary(g => g.Key, g => g.ToList());
        var contractByProfile= contracts  .GroupBy(c => c.ProfileId).ToDictionary(g => g.Key, g => g.OrderByDescending(c => c.ExpiryDate).First());
        var nineBoxByProfile = sccNineBox .Where(x => x.ProfileId != null).GroupBy(x => x.ProfileId!).ToDictionary(g => g.Key, g => g.First());
        var tagByProfile     = sccTalentTags.Where(x => x.ProfileId != null).GroupBy(x => x.ProfileId!).ToDictionary(g => g.Key, g => g.First());
        // For readiness from candidates: take "best" (most ready) per profile
        var candidateReadiness = sccCandidates
            .Where(c => c.ProfileId != null && c.ReadinessLevelName != null)
            .GroupBy(c => c.ProfileId!)
            .ToDictionary(g => g.Key, g => g
                .OrderBy(c => ReadinessRank(c.ReadinessLevelName))
                .First().ReadinessLevelName);

        var profileById  = profiles.ToDictionary(p => p.Id);

        var allProfileIds = evaByProfile.Keys
            .Union(promoByProfile.Keys)
            .Union(contractByProfile.Keys)
            .Union(nineBoxByProfile.Keys)
            .Union(tagByProfile.Keys)
            .Union(profileById.Keys)
            .Distinct()
            .ToList();

        Console.WriteLine($"[Sync] Total profileIds to process: {allProfileIds.Count}");

        // ── 4. Load existing extensions ───────────────────────────────────────
        var existingDict = await db.EmployeeExtensions
            .ToDictionaryAsync(e => e.VnrProfileId, ct);

        var toAdd = new List<EmployeeExtension>();

        foreach (var profileId in allProfileIds)
        {
            var existing = existingDict.GetValueOrDefault(profileId);
            if (existing?.IsManualOverride == true) continue;

            var ext = existing ?? new EmployeeExtension { VnrProfileId = profileId };

            // ── Performance score: SCC NineBox → HRE Eva result ──────────────
            int? perfScore = null;
            if (nineBoxByProfile.TryGetValue(profileId, out var nb))
            {
                perfScore = VnrSccClient.MapAxisScore(nb.PerformanceName)
                         ?? VnrSccClient.MapAxisScore(nb.PerformanceId);
            }
            if (!perfScore.HasValue && evaByProfile.TryGetValue(profileId, out var eva))
            {
                perfScore = Math.Clamp((int)Math.Round(eva.TotalScore), 0, 100);
            }
            if (perfScore.HasValue) ext.PerformanceScore = perfScore;

            // ── Potential score: SCC NineBox → HRE formula ───────────────────
            int? potScore = null;
            if (nineBoxByProfile.TryGetValue(profileId, out nb))
            {
                potScore = VnrSccClient.MapAxisScore(nb.PotentialName)
                        ?? VnrSccClient.MapAxisScore(nb.PotentialId);
            }
            if (!potScore.HasValue)
            {
                var promos = promoByProfile.GetValueOrDefault(profileId) ?? new();
                var recentPromos = promos.Count(p => p.EffectiveDate >= DateTime.UtcNow.AddYears(-3));
                var promoFactor  = Math.Min(recentPromos * 25, 100);
                potScore = Math.Clamp((int)Math.Round(promoFactor * 0.40 + 50 * 0.35 + 55 * 0.25), 0, 100);
            }
            ext.PotentialScore = potScore;

            // ── Risk score: HRE contract + performance ────────────────────────
            var riskReasons = new List<string>();
            int contractRisk = 0;
            if (contractByProfile.TryGetValue(profileId, out var contract))
            {
                var days = (contract.ExpiryDate - DateTime.UtcNow).Days;
                if      (days < 90)  { contractRisk = 90; riskReasons.Add("Hợp đồng sắp hết hạn"); }
                else if (days < 180) { contractRisk = 60; riskReasons.Add("Hợp đồng hết hạn < 6 tháng"); }
                else                   contractRisk = 10;
            }
            var perfRisk = ext.PerformanceScore.HasValue
                ? Math.Max(0, 100 - ext.PerformanceScore.Value)
                : 50;
            if (ext.PerformanceScore < 50) riskReasons.Add("Hiệu suất thấp");

            var promoList = promoByProfile.GetValueOrDefault(profileId) ?? new();
            var recentP   = promoList.Count(p => p.EffectiveDate >= DateTime.UtcNow.AddYears(-3));
            var stagnation = recentP == 0 ? 70 : 10;
            if (recentP == 0) riskReasons.Add("Chưa thăng tiến trong 3 năm");

            ext.RiskScore   = Math.Clamp((int)Math.Round(contractRisk * 0.40 + perfRisk * 0.35 + stagnation * 0.25), 0, 100);
            ext.RiskReasons = riskReasons;

            // ── Overall score ─────────────────────────────────────────────────
            if (ext.PerformanceScore.HasValue && ext.PotentialScore.HasValue)
                ext.OverallScore = (int)Math.Round(ext.PerformanceScore.Value * 0.6 + ext.PotentialScore.Value * 0.4);

            // ── TalentTier: SCC TalentTag (chính thức) → computed fallback ────
            string? sccTier = null;
            if (tagByProfile.TryGetValue(profileId, out var tag))
                sccTier = VnrSccClient.MapTier(tag.TalentTagName);

            ext.TalentTier = sccTier ?? (ext.PerformanceScore, ext.PotentialScore) switch
            {
                ( >= 80, >= 75) => "Core",
                ( >= 65, >= 60) => "Potential",
                ( >= 50, _    ) => "Successor",
                _               => null
            };

            // ── ReadinessLevel: SCC TalentTag → SCC Candidate → computed ──────
            string? readiness = null;
            if (tagByProfile.TryGetValue(profileId, out tag))
                readiness = VnrSccClient.MapReadiness(tag.ReadinessLevelName);

            if (readiness == null && candidateReadiness.TryGetValue(profileId, out var candReady))
                readiness = VnrSccClient.MapReadiness(candReady);

            if (readiness == null)
                readiness = ext.OverallScore switch
                {
                    >= 85 => "Ready Now",
                    >= 70 => "1-2 Years",
                    _     => "3+ Years"
                };
            ext.ReadinessLevel = readiness;

            // ── Profile snapshot ──────────────────────────────────────────────
            if (profileById.TryGetValue(profileId, out var profile))
            {
                ext.FullName       = profile.Name;
                ext.Email          = profile.Email;
                ext.OrgStructureId = profile.OrgStructureId;
                ext.JobTitleId     = profile.JobTitleId;
                ext.HireDate       = profile.DateCreate;
            }

            ext.LastSyncedAt = DateTime.UtcNow;
            ext.UpdatedAt    = DateTime.UtcNow;

            if (existing == null) toAdd.Add(ext);
        }

        if (toAdd.Count > 0) db.EmployeeExtensions.AddRange(toAdd);
        await db.SaveChangesAsync(ct);

        return new SyncResult
        {
            SyncedAt              = DateTime.UtcNow,
            ProfilesSynced        = profiles.Count > 0 ? profiles.Count : allProfileIds.Count,
            EvaAvailable          = evaResults.Count > 0,
            PromoAvailable        = promotions.Count > 0,
            ContractAvailable     = contracts.Count > 0,
            SccNineBoxAvailable   = sccNineBox.Count > 0,
            SccTalentTagAvailable = sccTalentTags.Count > 0,
            SccCandidateAvailable = sccCandidates.Count > 0,
        };
    }

    /// Lower rank = more ready (for picking "best" readiness from multiple positions)
    private static int ReadinessRank(string? name) => name?.Trim().ToLowerInvariant() switch
    {
        "sẵn sàng ngay" or "san sang ngay" or "ready now" or "sẵn sàng" => 0,
        "1-2 năm" or "1-2 years" or "ready in 1-2 years"               => 1,
        _                                                                => 2
    };

    private static async Task<List<T>> SafeFetch<T>(
        Func<Task<List<T>>> fetch, string endpointName)
    {
        try   { return await fetch(); }
        catch (Exception ex)
        {
            Console.WriteLine($"[Sync] {endpointName}: lỗi ({ex.Message}) — bỏ qua");
            return new List<T>();
        }
    }
}

public record SyncResult
{
    public DateTime SyncedAt              { get; init; }
    public int      ProfilesSynced        { get; init; }
    public bool     EvaAvailable          { get; init; }
    public bool     PromoAvailable        { get; init; }
    public bool     ContractAvailable     { get; init; }
    public bool     SccNineBoxAvailable   { get; init; }
    public bool     SccTalentTagAvailable { get; init; }
    public bool     SccCandidateAvailable { get; init; }
}
