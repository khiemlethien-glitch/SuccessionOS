namespace SuccessionOS.Domain.Entities;

public class EmployeeExtension
{
    public string VnrProfileId      { get; set; } = "";          // PK — khớp VnR Hre_Profile.Id
    public int?   PerformanceScore  { get; set; }                 // 0-100, null = chưa sync
    public int?   PotentialScore    { get; set; }
    public int?   RiskScore         { get; set; }
    public string? TalentTier       { get; set; }                 // "Core"|"Potential"|"Successor"|null
    public string? ReadinessLevel   { get; set; }                 // "Ready Now"|"1-2 Years"|"3+ Years"|null
    public int?   OverallScore      { get; set; }
    public CompetencyScores? Competencies { get; set; }           // JSON column
    public List<string> RiskReasons { get; set; } = new();       // JSON column
    public bool   IsManualOverride  { get; set; } = false;
    public DateTime? LastSyncedAt   { get; set; }
    public DateTime  UpdatedAt      { get; set; } = DateTime.UtcNow;

    // ── Profile snapshot (lưu khi sync, dùng khi VnR down) ──────────
    public string? FullName       { get; set; }
    public string? Email          { get; set; }
    public string? OrgStructureId { get; set; }   // VnR org id → resolve name khi có lookup
    public string? JobTitleId     { get; set; }   // VnR job title id → resolve name khi có lookup
    public DateTime? HireDate     { get; set; }
}

public class CompetencyScores
{
    public int Technical      { get; set; }
    public int Leadership     { get; set; }
    public int Communication  { get; set; }
    public int ProblemSolving { get; set; }
    public int Adaptability   { get; set; }
}
