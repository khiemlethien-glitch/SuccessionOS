using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SuccessionOS.Domain.Entities;
using SuccessionOS.Infrastructure.Data;

namespace SuccessionOS.API.Controllers;

[ApiController]
[Route("api/v1/key-positions")]
public class KeyPositionsController(SuccessionDbContext db) : ControllerBase
{
    // ─── GET /api/v1/key-positions ────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var positions = await db.KeyPositions
            .Where(p => !p.IsDeleted)
            .OrderBy(p => p.Department)
            .ThenBy(p => p.Title)
            .ToListAsync(ct);

        var data = positions.Select(MapToDto).ToList();
        return Ok(new { data, total = data.Count });
    }

    // ─── GET /api/v1/key-positions/{id} ──────────────────────────────────────
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id, CancellationToken ct)
    {
        var pos = await db.KeyPositions.FindAsync(new object[] { id }, ct);
        if (pos is null || pos.IsDeleted) return NotFound();
        return Ok(MapToDto(pos));
    }

    // ─── POST /api/v1/key-positions ───────────────────────────────────────────
    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] UpsertPositionRequest req,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Title) || string.IsNullOrWhiteSpace(req.Department))
            return BadRequest(new { error = "Title and Department are required." });

        var pos = new KeyPosition
        {
            Title         = req.Title.Trim(),
            Department    = req.Department.Trim(),
            CurrentHolder = req.CurrentHolder ?? "",
            IncumbentId   = req.IncumbentId,
            CriticalLevel = req.CriticalLevel ?? "Medium",
            ParentId      = req.ParentId,
            RequiredCompetencies = req.RequiredCompetencies ?? new(),
            SuccessorIds         = req.SuccessorIds ?? new(),
        };
        db.KeyPositions.Add(pos);
        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(GetById), new { id = pos.Id }, MapToDto(pos));
    }

    // ─── PUT /api/v1/key-positions/{id} ──────────────────────────────────────
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(
        string id,
        [FromBody] UpsertPositionRequest req,
        CancellationToken ct)
    {
        var pos = await db.KeyPositions.FindAsync(new object[] { id }, ct);
        if (pos is null || pos.IsDeleted) return NotFound();

        if (req.Title is not null)        pos.Title         = req.Title.Trim();
        if (req.Department is not null)   pos.Department    = req.Department.Trim();
        if (req.CurrentHolder is not null) pos.CurrentHolder = req.CurrentHolder;
        if (req.IncumbentId is not null)  pos.IncumbentId   = req.IncumbentId;
        if (req.CriticalLevel is not null) pos.CriticalLevel = req.CriticalLevel;
        if (req.ParentId is not null)     pos.ParentId      = req.ParentId;
        if (req.RequiredCompetencies is not null) pos.RequiredCompetencies = req.RequiredCompetencies;
        if (req.SuccessorIds is not null) pos.SuccessorIds  = req.SuccessorIds;

        pos.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(MapToDto(pos));
    }

    // ─── DELETE /api/v1/key-positions/{id} ───────────────────────────────────
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id, CancellationToken ct)
    {
        var pos = await db.KeyPositions.FindAsync(new object[] { id }, ct);
        if (pos is null || pos.IsDeleted) return NotFound();

        pos.IsDeleted  = true;
        pos.UpdatedAt  = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ─── Mapping ──────────────────────────────────────────────────────────────
    private static KeyPositionDto MapToDto(KeyPosition p)
    {
        var successorCount = p.SuccessorIds.Count;
        // readyNowCount: không có readiness per-successor ở KeyPosition — 0 placeholder
        // (SuccessionPlan có readiness thực; dashboard dùng plans, không dùng KeyPosition trực tiếp)
        var readyNowCount = 0;

        var riskLevel = (successorCount, readyNowCount) switch
        {
            (0, _) => "High",
            (_, 0) => "High",
            (_, < 2) => "Medium",
            _ => "Low"
        };

        return new KeyPositionDto(
            Id:                   p.Id,
            Title:                p.Title,
            Department:           p.Department,
            CurrentHolder:        p.CurrentHolder,
            IncumbentId:          p.IncumbentId,
            CriticalLevel:        p.CriticalLevel,
            RiskLevel:            riskLevel,
            SuccessorCount:       successorCount,
            ReadyNowCount:        readyNowCount,
            ParentId:             p.ParentId,
            RequiredCompetencies: p.RequiredCompetencies,
            Successors:           p.SuccessorIds
        );
    }
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

public record KeyPositionDto(
    string Id,
    string Title,
    string Department,
    string CurrentHolder,
    string? IncumbentId,
    string CriticalLevel,
    string RiskLevel,
    int SuccessorCount,
    int ReadyNowCount,
    string? ParentId,
    List<string> RequiredCompetencies,
    List<string> Successors);

public record UpsertPositionRequest(
    string? Title,
    string? Department,
    string? CurrentHolder,
    string? IncumbentId,
    string? CriticalLevel,
    string? ParentId,
    List<string>? RequiredCompetencies,
    List<string>? SuccessorIds);
