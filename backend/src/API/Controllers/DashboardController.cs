using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using SuccessionOS.Infrastructure.Data;
using SuccessionOS.Infrastructure.VnrHre;

namespace SuccessionOS.API.Controllers;

[ApiController]
[Route("api/v1/dashboard")]
public class DashboardController(
    SuccessionDbContext db,
    VnrHreClient vnr,
    IMemoryCache cache) : ControllerBase
{
    private const string KpiCacheKey = "dashboard_kpi";

    // ─── GET /api/v1/dashboard/kpi ────────────────────────────────────────────
    [HttpGet("kpi")]
    public async Task<IActionResult> GetKpi(CancellationToken ct)
    {
        // Cache 2 phút — KPI không cần real-time
        if (cache.TryGetValue(KpiCacheKey, out var cached))
            return Ok(cached);

        // 3 queries song song — tất cả từ SuccessionOS DB
        var extensionsTask = db.EmployeeExtensions.ToListAsync(ct);
        var positionsTask  = db.KeyPositions.Where(p => !p.IsDeleted).ToListAsync(ct);
        var idpsTask       = db.IdpPlans.ToListAsync(ct);

        await Task.WhenAll(extensionsTask, positionsTask, idpsTask);

        var extensions = await extensionsTask;
        var positions  = await positionsTask;
        var idps       = await idpsTask;

        var activeIdps = idps.Where(i => i.Status == "Active").ToList();
        var highRisk   = extensions
            .Where(e => e.RiskScore >= 60)
            .OrderByDescending(e => e.RiskScore)
            .Take(3)
            .ToList();

        // TotalTalents: từ EmployeeExtension nếu đã sync, fallback VnR count (resilient)
        int totalTalents = extensions.Count;
        if (totalTalents == 0)
        {
            try { totalTalents = (await vnr.GetProfilesAsync(ct)).Count; }
            catch (Exception ex)
            {
                Console.WriteLine($"[Dashboard] VnR fallback failed: {ex.Message}");
            }
        }

        // Tier counts — map internal names về Vietnamese để match frontend
        var tierCounts = extensions
            .GroupBy(e => MapTier(e.TalentTier))
            .ToDictionary(g => g.Key, g => g.Count());

        // Đảm bảo có đủ keys mà frontend expect
        foreach (var key in new[] { "Nòng cốt", "Tiềm năng", "Kế thừa", "Chưa phân bổ" })
            tierCounts.TryAdd(key, 0);

        var result = new
        {
            totalTalents,
            tierCounts,
            positionsWithSuccessors = positions.Count(p => p.SuccessorIds.Count > 0),
            positionsNoSuccessor    = positions.Count(p => p.SuccessorIds.Count == 0),
            highRiskTalents         = extensions.Count(e => e.RiskScore >= 60),
            activeIdps              = activeIdps.Count,
            avgIdpProgress          = activeIdps.Count > 0
                ? (int)activeIdps.Average(i => i.OverallProgress)
                : 0,
            // topRisk: frontend resolve fullName+position từ employees list đã cached
            topRisk = highRisk.Select(e => new
            {
                id          = e.VnrProfileId,
                riskScore   = e.RiskScore,
                riskReasons = e.RiskReasons
            })
        };

        cache.Set(KpiCacheKey, result,
            new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(2)
            });

        return Ok(result);
    }

    private static string MapTier(string? tier) => tier switch
    {
        "Core"      => "Nòng cốt",
        "Potential" => "Tiềm năng",
        "Successor" => "Kế thừa",
        _           => "Chưa phân bổ"
    };
}
