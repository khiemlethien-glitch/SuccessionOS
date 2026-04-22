using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using SuccessionOS.Application.Services;
using SuccessionOS.Domain.Entities;
using SuccessionOS.Infrastructure.Data;
using SuccessionOS.Infrastructure.VnrHre;

namespace SuccessionOS.API.Controllers;

[ApiController]
[Route("api/v1/employees")]
public class EmployeesController(
    SuccessionDbContext db,
    VnrHreClient vnr,
    IMemoryCache cache) : ControllerBase
{
    // ─── GET /api/v1/employees ────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? department,
        [FromQuery] string? tier,
        CancellationToken ct)
    {
        // Parallel: profiles + lookups + extensions
        var profilesTask    = vnr.GetProfilesAsync(ct);
        var orgTask         = vnr.GetOrgLookupAsync(cache, ct);
        var jobTask         = vnr.GetJobTitleLookupAsync(cache, ct);
        var extensionsTask  = db.EmployeeExtensions.ToDictionaryAsync(e => e.VnrProfileId, ct);

        await Task.WhenAll(profilesTask, orgTask, jobTask, extensionsTask);

        var profiles   = await profilesTask;
        var orgLookup  = await orgTask;
        var jobLookup  = await jobTask;
        var extensions = await extensionsTask;

        // Nếu VnR down nhưng đã có data trong DB → dùng extension snapshot làm fallback
        if (profiles.Count == 0 && extensions.Count > 0)
        {
            var fallbackData = extensions.Values
                .Where(e => !string.IsNullOrEmpty(e.FullName))
                .Select(e => MapFromExtension(e, orgLookup, jobLookup))
                .Where(d => department == null || d.Department == department)
                .Where(d => tier == null       || d.TalentTier == tier)
                .ToList();
            if (fallbackData.Count > 0)
                return Ok(new { data = fallbackData, total = fallbackData.Count });
        }

        var data = profiles
            .Select(p => MapToDto(p, orgLookup, jobLookup, extensions.GetValueOrDefault(p.Id)))
            .Where(d => department == null || d.Department == department)
            .Where(d => tier == null       || d.TalentTier == tier)
            .ToList();

        return Ok(new { data, total = data.Count });
    }

    // ─── GET /api/v1/employees/{id} ───────────────────────────────────────────
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id, CancellationToken ct)
    {
        var profileTask    = vnr.GetProfileByIdAsync(id, cache, ct);
        var orgTask        = vnr.GetOrgLookupAsync(cache, ct);
        var jobTask        = vnr.GetJobTitleLookupAsync(cache, ct);
        var extensionTask  = db.EmployeeExtensions.FindAsync(new object[] { id }, ct).AsTask();

        await Task.WhenAll(profileTask, orgTask, jobTask, extensionTask);

        var profile = await profileTask;
        if (profile is null) return NotFound();

        var dto = MapToDto(profile, await orgTask, await jobTask, await extensionTask);
        return Ok(dto);
    }

    // ─── POST /api/v1/employees/sync ──────────────────────────────────────────
    [HttpPost("sync")]
    public async Task<IActionResult> Sync(
        [FromServices] EmployeeSyncService svc,
        CancellationToken ct)
    {
        try
        {
            var result = await svc.SyncAllAsync(ct);
            return Ok(new
            {
                message  = "Sync completed",
                syncedAt = result.SyncedAt,
                profiles = result.ProfilesSynced,
                endpoints = new
                {
                    contractEvaResult = result.EvaAvailable          ? "✅ OK" : "⏳ chưa mở",
                    promotion         = result.PromoAvailable         ? "✅ OK" : "⏳ chưa mở",
                    contract          = result.ContractAvailable      ? "✅ OK" : "⏳ chưa mở",
                    sccNineBox        = result.SccNineBoxAvailable    ? "✅ OK" : "⏳ chưa mở",
                    sccTalentTag      = result.SccTalentTagAvailable  ? "✅ OK" : "⏳ chưa mở",
                    sccCandidate      = result.SccCandidateAvailable  ? "✅ OK" : "⏳ chưa mở",
                }
            });
        }
        catch (HttpRequestException ex)
        {
            return StatusCode(502, new
            {
                error   = "vnr_unreachable",
                message = $"Không kết nối được VnR HRE API: {ex.Message}"
            });
        }
    }

    // ─── PATCH /api/v1/employees/{id}/scores ─────────────────────────────────
    [HttpPatch("{id}/scores")]
    public async Task<IActionResult> OverrideScores(
        string id,
        [FromBody] OverrideScoresRequest req,
        CancellationToken ct)
    {
        var ext = await db.EmployeeExtensions.FindAsync(new object[] { id }, ct);
        if (ext is null) return NotFound();

        if (req.PerformanceScore.HasValue) ext.PerformanceScore = req.PerformanceScore;
        if (req.PotentialScore.HasValue)   ext.PotentialScore   = req.PotentialScore;
        if (req.RiskScore.HasValue)        ext.RiskScore        = req.RiskScore;
        if (req.TalentTier is not null)    ext.TalentTier       = req.TalentTier;

        ext.IsManualOverride = true;
        ext.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);
        return Ok(ext);
    }

    // ─── Mapping ──────────────────────────────────────────────────────────────

    private static EmployeeDto MapToDto(
        VnrProfile p,
        Dictionary<string, string> org,
        Dictionary<string, string> jobs,
        EmployeeExtension? ext)
    {
        var hireDate = p.DateCreate ?? DateTime.UtcNow;
        var yearsExp = (int)((DateTime.UtcNow - hireDate).TotalDays / 365);

        return new EmployeeDto(
            Id:               p.Id,
            FullName:         p.Name,
            Department:       org.GetValueOrDefault(p.OrgStructureId ?? "", "—"),
            Position:         jobs.GetValueOrDefault(p.JobTitleId ?? "", "—"),
            Email:            p.Email ?? "",
            HireDate:         hireDate.ToString("yyyy-MM-dd"),
            YearsOfExperience: yearsExp,

            // Scores — null nếu chưa sync (frontend hiển thị "--")
            TalentTier:       MapTier(ext?.TalentTier),
            PotentialLevel:   MapPotentialLevel(ext?.PotentialScore),
            PerformanceScore: ext?.PerformanceScore,
            PotentialScore:   ext?.PotentialScore,
            RiskScore:        ext?.RiskScore,
            OverallScore:     ext?.OverallScore,
            ReadinessLevel:   MapReadiness(ext?.ReadinessLevel),
            RiskReasons:      ext?.RiskReasons ?? new(),
            Competencies:     ext?.Competencies is { } c
                ? new CompetenciesDto(c.Technical, c.Leadership, c.Communication, c.ProblemSolving, c.Adaptability)
                : null
        );
    }

    private static EmployeeDto MapFromExtension(
        EmployeeExtension ext,
        Dictionary<string, string> org,
        Dictionary<string, string> jobs)
    {
        var hireDate = ext.HireDate ?? DateTime.UtcNow;
        var yearsExp = (int)((DateTime.UtcNow - hireDate).TotalDays / 365);
        return new EmployeeDto(
            Id:               ext.VnrProfileId,
            FullName:         ext.FullName ?? $"Employee {ext.VnrProfileId[..8]}",
            Department:       org.GetValueOrDefault(ext.OrgStructureId ?? "", ext.OrgStructureId ?? "—"),
            Position:         jobs.GetValueOrDefault(ext.JobTitleId ?? "", ext.JobTitleId ?? "—"),
            Email:            ext.Email ?? "",
            HireDate:         hireDate.ToString("yyyy-MM-dd"),
            YearsOfExperience: yearsExp,
            TalentTier:       MapTier(ext.TalentTier),
            PotentialLevel:   MapPotentialLevel(ext.PotentialScore),
            PerformanceScore: ext.PerformanceScore,
            PotentialScore:   ext.PotentialScore,
            RiskScore:        ext.RiskScore,
            OverallScore:     ext.OverallScore,
            ReadinessLevel:   MapReadiness(ext.ReadinessLevel),
            RiskReasons:      ext.RiskReasons ?? new(),
            Competencies:     ext.Competencies is { } c
                ? new CompetenciesDto(c.Technical, c.Leadership, c.Communication, c.ProblemSolving, c.Adaptability)
                : null
        );
    }

    /// <summary>Map nội bộ "Core|Potential|Successor" → frontend Vietnamese labels</summary>
    private static string? MapTier(string? tier) => tier switch
    {
        "Core"      => "Nòng cốt",
        "Potential" => "Tiềm năng",
        "Successor" => "Kế thừa",
        _           => null
    };

    /// <summary>Map readiness về chuẩn frontend ReadinessLevel type</summary>
    private static string? MapReadiness(string? r) => r switch
    {
        "Ready Now" => "Ready Now",
        "1-2 Years" => "Ready in 1 Year",
        "3+ Years"  => "Ready in 2 Years",
        _           => null
    };

    /// <summary>Derive potentialLevel từ potentialScore để match frontend PotentialLevel type</summary>
    private static string? MapPotentialLevel(int? score) => score switch
    {
        >= 85 => "Very High",
        >= 70 => "High",
        >= 50 => "Medium",
        >= 0  => "Low",
        _     => null
    };
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

public record EmployeeDto(
    string Id,
    string FullName,
    string Department,
    string Position,
    string Email,
    string HireDate,
    int YearsOfExperience,
    string? TalentTier,
    string? PotentialLevel,
    int? PerformanceScore,
    int? PotentialScore,
    int? RiskScore,
    int? OverallScore,
    string? ReadinessLevel,
    List<string> RiskReasons,
    CompetenciesDto? Competencies);

public record CompetenciesDto(
    int Technical,
    int Leadership,
    int Communication,
    int ProblemSolving,
    int Adaptability);

public record OverrideScoresRequest(
    int? PerformanceScore,
    int? PotentialScore,
    int? RiskScore,
    string? TalentTier);
