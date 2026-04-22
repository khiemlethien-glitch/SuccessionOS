using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using SuccessionOS.Application.Services;
using SuccessionOS.Domain.Entities;
using SuccessionOS.Infrastructure.Data;
using SuccessionOS.Infrastructure.VnrHre;

namespace SuccessionOS.API.Controllers;

/// <summary>
/// Các endpoint phụ thuộc theo từng talent ID.
/// Dữ liệu lưu trong SuccessionOS DB — HR/Admin nhập qua API hoặc seeder.
/// Khi chưa có data → trả 404, frontend hiển thị empty state (đã có error handler).
/// </summary>
[ApiController]
public class TalentProfileController(
    SuccessionDbContext db,
    VnrHreClient vnr,
    IMemoryCache cache,
    AiInsightService aiInsight) : ControllerBase
{
    // ─── GET /api/v1/employees/{id}/review ───────────────────────────────────
    [HttpGet("api/v1/employees/{id}/review")]
    public async Task<IActionResult> GetCareerReview(string id, CancellationToken ct)
    {
        var review = await db.CareerReviews
            .Where(r => r.TalentId == id)
            .OrderByDescending(r => r.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (review is null) return NotFound(new { message = $"No career review found for talent {id}" });

        return Ok(new
        {
            data = new
            {
                period      = review.Period,
                categories  = review.Categories.Select(c => new { label = c.Label, weight = c.Weight, score = c.Score }),
                overall     = review.Overall,
                strengths   = review.Strengths,
                needsDev    = review.NeedsDev,
                managerNote = review.ManagerNote,
            }
        });
    }

    // ─── GET /api/v1/employees/{id}/current-project ──────────────────────────
    [HttpGet("api/v1/employees/{id}/current-project")]
    public async Task<IActionResult> GetCurrentProject(string id, CancellationToken ct)
    {
        var proj = await db.CurrentProjects
            .Where(p => p.TalentId == id)
            .OrderByDescending(p => p.UpdatedAt)
            .FirstOrDefaultAsync(ct);

        if (proj is null) return NotFound(new { message = $"No current project for talent {id}" });

        return Ok(new
        {
            data = new
            {
                name   = proj.Name,
                type   = proj.Type,
                role   = proj.Role,
                client = proj.Client,
                value  = proj.Value,
                status = proj.Status,
            }
        });
    }

    // ─── GET /api/v1/employees/{id}/knowledge-transfer ───────────────────────
    [HttpGet("api/v1/employees/{id}/knowledge-transfer")]
    public async Task<IActionResult> GetKnowledgeTransfer(string id, CancellationToken ct)
    {
        var ktp = await db.KnowledgeTransfers
            .Where(k => k.TalentId == id)
            .OrderByDescending(k => k.UpdatedAt)
            .FirstOrDefaultAsync(ct);

        if (ktp is null) return NotFound(new { message = $"No knowledge transfer plan for talent {id}" });

        return Ok(new
        {
            data = new
            {
                successor       = ktp.Successor,
                successorRole   = ktp.SuccessorRole,
                startDate       = ktp.StartDate,
                targetDate      = ktp.TargetDate,
                overallProgress = ktp.OverallProgress,
                items = ktp.Items.Select(i => new
                {
                    title    = i.Title,
                    category = i.Category,
                    status   = i.Status,
                    progress = i.Progress,
                }),
            }
        });
    }

    // ─── GET /api/v1/assessments/{id}/latest ─────────────────────────────────
    [HttpGet("api/v1/assessments/{id}/latest")]
    public async Task<IActionResult> GetAssessment360Latest(string id, CancellationToken ct)
    {
        var a = await db.Assessments360
            .Where(x => x.TalentId == id)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (a is null) return NotFound(new { message = $"No 360 assessment for talent {id}" });

        return Ok(new
        {
            data = new
            {
                overall     = a.Overall,
                benchmark   = a.Benchmark,
                period      = a.Period,
                sources     = a.Sources.Select(s => new { label = s.Label, pct = s.Pct }),
                criteria    = a.Criteria.Select(c => new { label = c.Label, score = c.Score }),
                strengths   = a.Strengths,
                needsDev    = a.NeedsDev,
                managerNote = a.ManagerNote,
            }
        });
    }

    // ─── GET /api/v1/idp/{id}/employee ───────────────────────────────────────
    [HttpGet("api/v1/idp/{id}/employee")]
    public async Task<IActionResult> GetIdpByEmployee(string id, CancellationToken ct)
    {
        var idp = await db.IdpPlanDetails
            .Where(i => i.TalentId == id)
            .OrderByDescending(i => i.Year)
            .FirstOrDefaultAsync(ct);

        if (idp is null) return NotFound(new { message = $"No IDP found for talent {id}" });

        return Ok(new
        {
            data = new
            {
                id              = idp.Id,
                talentId        = idp.TalentId,
                talentName      = idp.TalentName,
                year            = idp.Year,
                status          = idp.Status,
                overallProgress = idp.OverallProgress,
                targetPosition  = idp.TargetPosition,
                approvedBy      = idp.ApprovedBy,
                approvedDate    = idp.ApprovedDate,
                goals12m        = idp.Goals12m,
                goals2to3y      = idp.Goals2to3y,
                goals = idp.Goals.Select(g => new
                {
                    id       = g.Id,
                    title    = g.Title,
                    category = g.Category,
                    type     = g.Type,
                    deadline = g.Deadline,
                    status   = g.Status,
                    progress = g.Progress,
                    mentor   = g.Mentor,
                }),
            }
        });
    }

    // ─── GET /api/v1/talent-profile/{id}/ai-insight ──────────────────────────
    /// <summary>Sinh phân tích nhân tài bằng OpenAI GPT-4o-mini</summary>
    [HttpGet("api/v1/talent-profile/{id}/ai-insight")]
    public async Task<IActionResult> GetAiInsight(string id, CancellationToken ct)
    {
        // Fetch employee data — graceful fallback nếu VnR không sẵn sàng
        VnrProfile? profile = null;
        try
        {
            var orgTask  = vnr.GetOrgLookupAsync(cache, ct);
            var jobTask  = vnr.GetJobTitleLookupAsync(cache, ct);
            var profTask = vnr.GetProfileByIdAsync(id, cache, ct);
            await Task.WhenAll(orgTask, jobTask, profTask);
            profile = await profTask;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[AiInsight] VnR fetch failed for {id}: {ex.Message}");
        }

        var orgLookup  = new Dictionary<string, string>();
        var jobLookup  = new Dictionary<string, string>();
        try
        {
            orgLookup = await vnr.GetOrgLookupAsync(cache, ct);
            jobLookup = await vnr.GetJobTitleLookupAsync(cache, ct);
        }
        catch { /* dùng empty lookups */ }

        var ext = await db.EmployeeExtensions.FindAsync(new object[] { id }, ct);

        var hireDate   = profile?.DateCreate ?? DateTime.UtcNow;
        var yearsExp   = (int)((DateTime.UtcNow - hireDate).TotalDays / 365);
        var fullName   = profile?.Name ?? id;
        var department = orgLookup.GetValueOrDefault(profile?.OrgStructureId ?? "", "—");
        var position   = jobLookup.GetValueOrDefault(profile?.JobTitleId ?? "", "—");

        var req = new TalentInsightRequest(
            FullName:          fullName,
            Position:          position,
            Department:        department,
            YearsOfExperience: yearsExp,
            PerformanceScore:  ext?.PerformanceScore,
            PotentialScore:    ext?.PotentialScore,
            RiskScore:         ext?.RiskScore,
            OverallScore:      ext?.OverallScore,
            TalentTier:        ext?.TalentTier,
            ReadinessLevel:    ext?.ReadinessLevel,
            RiskReasons:       ext?.RiskReasons ?? new(),
            Technical:         ext?.Competencies?.Technical,
            Leadership:        ext?.Competencies?.Leadership,
            Communication:     ext?.Competencies?.Communication,
            ProblemSolving:    ext?.Competencies?.ProblemSolving,
            Adaptability:      ext?.Competencies?.Adaptability
        );

        var apiKey = HttpContext.RequestServices
            .GetRequiredService<IConfiguration>()["OpenAI:ApiKey"];

        if (string.IsNullOrWhiteSpace(apiKey))
            return NoContent(); // 204

        var insight = await aiInsight.GenerateTalentInsightAsync(req, ct);
        return Ok(new { insight });
    }

    // ─── PUT /api/v1/employees/{id}/review ───────────────────────────────────
    /// <summary>HR/Admin nhập hoặc cập nhật career review</summary>
    [HttpPut("api/v1/employees/{id}/review")]
    public async Task<IActionResult> UpsertCareerReview(
        string id,
        [FromBody] UpsertCareerReviewRequest req,
        CancellationToken ct)
    {
        var existing = await db.CareerReviews
            .Where(r => r.TalentId == id && r.Period == req.Period)
            .FirstOrDefaultAsync(ct);

        if (existing is not null)
        {
            existing.Overall     = req.Overall;
            existing.Categories  = req.Categories?.Select(c => new CareerCategory { Label = c.Label, Weight = c.Weight, Score = c.Score }).ToList() ?? new();
            existing.Strengths   = req.Strengths ?? new();
            existing.NeedsDev    = req.NeedsDev ?? new();
            existing.ManagerNote = req.ManagerNote ?? "";
            await db.SaveChangesAsync(ct);
            return Ok(existing);
        }

        var review = new CareerReview
        {
            TalentId    = id,
            Period      = req.Period,
            Overall     = req.Overall,
            Categories  = req.Categories?.Select(c => new CareerCategory { Label = c.Label, Weight = c.Weight, Score = c.Score }).ToList() ?? new(),
            Strengths   = req.Strengths ?? new(),
            NeedsDev    = req.NeedsDev ?? new(),
            ManagerNote = req.ManagerNote ?? "",
        };
        db.CareerReviews.Add(review);
        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(GetCareerReview), new { id }, review);
    }
}

// ─── Request DTOs ─────────────────────────────────────────────────────────────

public record UpsertCareerReviewRequest(
    string Period,
    int Overall,
    List<CareerCategoryRequest>? Categories,
    List<string>? Strengths,
    List<string>? NeedsDev,
    string? ManagerNote);

public record CareerCategoryRequest(string Label, int Weight, int Score);
