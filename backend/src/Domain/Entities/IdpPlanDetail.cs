namespace SuccessionOS.Domain.Entities;

/// <summary>Kế hoạch phát triển cá nhân chi tiết (IDP full — có goals)</summary>
public class IdpPlanDetail
{
    public string Id              { get; set; } = Guid.NewGuid().ToString();
    public string TalentId        { get; set; } = "";
    public string TalentName      { get; set; } = "";
    public int    Year            { get; set; }
    public string Status          { get; set; } = "Pending"; // Active|Pending|Completed
    public int    OverallProgress { get; set; }
    public string TargetPosition  { get; set; } = "";
    public string ApprovedBy      { get; set; } = "";
    public string ApprovedDate    { get; set; } = "";
    public List<string>  Goals12m   { get; set; } = new();  // JSON
    public List<string>  Goals2to3y { get; set; } = new();  // JSON
    public List<IdpGoal> Goals       { get; set; } = new();  // JSON
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class IdpGoal
{
    public string Id       { get; set; } = Guid.NewGuid().ToString();
    public string Title    { get; set; } = "";
    public string Category { get; set; } = "";
    public string Type     { get; set; } = "";
    public string Deadline { get; set; } = "";
    public string Status   { get; set; } = "Not Started";
    public int    Progress { get; set; }
    public string? Mentor  { get; set; }
}
