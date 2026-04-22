using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SuccessionOS.Domain.Entities;
using SuccessionOS.Infrastructure.Data;
using SuccessionOS.Infrastructure.VnrHre;

namespace SuccessionOS.API.Controllers;

[ApiController]
[Route("api/v1/succession")]
public class SuccessionController(SuccessionDbContext db, VnrHreClient vnr) : ControllerBase
{
    // ─── GET /api/v1/succession/plans ────────────────────────────────────────
    [HttpGet("plans")]
    public async Task<IActionResult> GetPlans(CancellationToken ct)
    {
        var plans = await db.SuccessionPlans.ToListAsync(ct);
        var data  = plans.Select(MapToDto).ToList();
        return Ok(new { data, total = data.Count });
    }

    // ─── GET /api/v1/succession/plans/{id} ───────────────────────────────────
    [HttpGet("plans/{id}")]
    public async Task<IActionResult> GetPlanById(string id, CancellationToken ct)
    {
        var plan = await db.SuccessionPlans.FindAsync(new object[] { id }, ct);
        if (plan is null) return NotFound();
        return Ok(MapToDto(plan));
    }

    // ─── GET /api/v1/succession/employee/{id} ────────────────────────────────
    /// <summary>Plans where any successor.talentId == id</summary>
    [HttpGet("employee/{id}")]
    public async Task<IActionResult> GetPlansByEmployee(string id, CancellationToken ct)
    {
        // OwnsMany JSON: load all then filter in memory (SQLite JSON path support limited)
        var plans = await db.SuccessionPlans.ToListAsync(ct);
        var data  = plans
            .Where(p => p.Successors.Any(s => s.TalentId == id))
            .Select(MapToDto)
            .ToList();
        return Ok(new { data, total = data.Count });
    }

    // ─── GET /api/v1/succession/nine-box ─────────────────────────────────────
    /// <summary>All EmployeeExtension scores for 9-Box grid rendering</summary>
    [HttpGet("nine-box")]
    public async Task<IActionResult> GetNineBox(CancellationToken ct)
    {
        var extensions = await db.EmployeeExtensions
            .Select(e => new {
                id               = e.VnrProfileId,
                performanceScore = e.PerformanceScore,
                potentialScore   = e.PotentialScore,
                talentTier       = e.TalentTier,
                overallScore     = e.OverallScore
            })
            .ToListAsync(ct);

        // Optionally enrich with fullName from VnR cache if available
        Dictionary<string, string>? nameCache = null;
        try
        {
            var profiles = await vnr.GetProfilesAsync(ct);
            nameCache = profiles.ToDictionary(p => p.Id, p => p.Name);
        }
        catch
        {
            // VnR unavailable — return without names, frontend resolves from employees list
        }

        var data = extensions.Select(e => new {
            e.id,
            fullName         = nameCache?.GetValueOrDefault(e.id),
            e.performanceScore,
            e.potentialScore,
            e.talentTier,
            e.overallScore
        }).ToList();

        return Ok(new { data, total = data.Count });
    }

    // ─── POST /api/v1/succession/plans ───────────────────────────────────────
    /// <summary>Create or upsert by positionId</summary>
    [HttpPost("plans")]
    public async Task<IActionResult> UpsertPlan(
        [FromBody] UpsertPlanRequest req,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.PositionId))
            return BadRequest(new { error = "positionId is required." });

        // Upsert: update existing plan for same position, or create new
        var existing = await db.SuccessionPlans
            .FirstOrDefaultAsync(p => p.PositionId == req.PositionId, ct);

        if (existing is not null)
        {
            if (req.PositionTitle is not null) existing.PositionTitle = req.PositionTitle;
            if (req.Department is not null)    existing.Department    = req.Department;
            if (req.Successors is not null)    existing.Successors    = MapSuccessorEntries(req.Successors);
            await db.SaveChangesAsync(ct);
            return Ok(MapToDto(existing));
        }

        var plan = new SuccessionPlan
        {
            PositionId    = req.PositionId,
            PositionTitle = req.PositionTitle ?? "",
            Department    = req.Department ?? "",
            Successors    = MapSuccessorEntries(req.Successors ?? new()),
        };
        db.SuccessionPlans.Add(plan);
        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(GetPlanById), new { id = plan.Id }, MapToDto(plan));
    }

    // ─── PUT /api/v1/succession/plans/{id} ───────────────────────────────────
    [HttpPut("plans/{id}")]
    public async Task<IActionResult> UpdatePlan(
        string id,
        [FromBody] UpsertPlanRequest req,
        CancellationToken ct)
    {
        var plan = await db.SuccessionPlans.FindAsync(new object[] { id }, ct);
        if (plan is null) return NotFound();

        if (req.PositionTitle is not null) plan.PositionTitle = req.PositionTitle;
        if (req.Department is not null)    plan.Department    = req.Department;
        if (req.Successors is not null)    plan.Successors    = MapSuccessorEntries(req.Successors);

        await db.SaveChangesAsync(ct);
        return Ok(MapToDto(plan));
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private static SuccessionPlanDto MapToDto(SuccessionPlan p) => new(
        Id:            p.Id,
        PositionId:    p.PositionId,
        PositionTitle: p.PositionTitle,
        Department:    p.Department,
        Successors:    p.Successors.Select(s => new SuccessorDto(
            s.TalentId, s.TalentName,
            MapReadiness(s.Readiness),
            s.Priority, s.GapScore)).ToList()
    );

    /// <summary>Map readiness về chuẩn frontend ReadinessLevel type</summary>
    private static string MapReadiness(string r) => r switch
    {
        "Ready Now" => "Ready Now",
        "1-2 Years" => "Ready in 1 Year",
        "3+ Years"  => "Ready in 2 Years",
        _           => r
    };

    private static List<SuccessorEntry> MapSuccessorEntries(List<SuccessorEntryRequest> reqs)
        => reqs.Select(r => new SuccessorEntry
        {
            TalentId   = r.TalentId,
            TalentName = r.TalentName,
            Readiness  = r.Readiness ?? "3+ Years",
            Priority   = r.Priority,
            GapScore   = r.GapScore,
        }).ToList();
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

public record SuccessionPlanDto(
    string Id,
    string PositionId,
    string PositionTitle,
    string Department,
    List<SuccessorDto> Successors);

public record SuccessorDto(
    string TalentId,
    string TalentName,
    string Readiness,
    int Priority,
    int GapScore);

public record UpsertPlanRequest(
    string? PositionId,
    string? PositionTitle,
    string? Department,
    List<SuccessorEntryRequest>? Successors);

public record SuccessorEntryRequest(
    string TalentId,
    string TalentName,
    string? Readiness,
    int Priority,
    int GapScore);
