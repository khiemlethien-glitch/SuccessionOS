namespace SuccessionOS.Domain.Entities;

public class IdpPlan
{
    public string Id              { get; set; } = Guid.NewGuid().ToString();
    public string TalentId        { get; set; } = "";
    public string TalentName      { get; set; } = "";
    public int    Year            { get; set; }
    public string Status          { get; set; } = "Pending"; // Active|Pending|Completed
    public int    OverallProgress { get; set; }               // 0-100
}
