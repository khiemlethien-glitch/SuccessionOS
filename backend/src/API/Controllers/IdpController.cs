using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SuccessionOS.Domain.Entities;
using SuccessionOS.Infrastructure.Data;

namespace SuccessionOS.API.Controllers;

/// <summary>
/// CRUD cho IdpPlan (summary records).
/// Dữ liệu chi tiết per-employee dùng GET /api/v1/idp/{id}/employee (TalentProfileController).
/// </summary>
[ApiController]
[Route("api/v1/idp")]
public class IdpController(SuccessionDbContext db) : ControllerBase
{
    // ─── GET /api/v1/idp ─────────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? talentId,
        [FromQuery] string? status,
        CancellationToken ct)
    {
        var query = db.IdpPlans.AsQueryable();
        if (!string.IsNullOrWhiteSpace(talentId)) query = query.Where(i => i.TalentId == talentId);
        if (!string.IsNullOrWhiteSpace(status))   query = query.Where(i => i.Status == status);

        var data = await query.OrderByDescending(i => i.Year).ToListAsync(ct);
        return Ok(new { data, total = data.Count });
    }

    // ─── GET /api/v1/idp/{id} ────────────────────────────────────────────────
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id, CancellationToken ct)
    {
        var plan = await db.IdpPlans.FindAsync(new object[] { id }, ct);
        if (plan is null) return NotFound();
        return Ok(new { data = plan });
    }

    // ─── POST /api/v1/idp ────────────────────────────────────────────────────
    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] UpsertIdpRequest req,
        CancellationToken ct)
    {
        var plan = new IdpPlan
        {
            TalentId        = req.TalentId,
            TalentName      = req.TalentName,
            Year            = req.Year,
            Status          = req.Status ?? "Pending",
            OverallProgress = req.OverallProgress,
        };
        db.IdpPlans.Add(plan);
        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(GetById), new { id = plan.Id }, new { data = plan });
    }

    // ─── PUT /api/v1/idp/{id} ────────────────────────────────────────────────
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(
        string id,
        [FromBody] UpsertIdpRequest req,
        CancellationToken ct)
    {
        var plan = await db.IdpPlans.FindAsync(new object[] { id }, ct);
        if (plan is null) return NotFound();

        plan.TalentId        = req.TalentId;
        plan.TalentName      = req.TalentName;
        plan.Year            = req.Year;
        plan.Status          = req.Status ?? plan.Status;
        plan.OverallProgress = req.OverallProgress;

        await db.SaveChangesAsync(ct);
        return Ok(new { data = plan });
    }
}

public record UpsertIdpRequest(
    string TalentId,
    string TalentName,
    int    Year,
    int    OverallProgress,
    string? Status);
