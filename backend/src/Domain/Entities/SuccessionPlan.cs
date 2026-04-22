namespace SuccessionOS.Domain.Entities;

public class SuccessionPlan
{
    public string Id            { get; set; } = Guid.NewGuid().ToString();
    public string PositionId    { get; set; } = "";
    public string PositionTitle { get; set; } = "";
    public string Department    { get; set; } = "";
    public List<SuccessorEntry> Successors { get; set; } = new(); // JSON column
}

public class SuccessorEntry
{
    public string TalentId   { get; set; } = "";
    public string TalentName { get; set; } = "";
    public string Readiness  { get; set; } = "3+ Years"; // "Ready Now"|"1-2 Years"|"3+ Years"
    public int Priority      { get; set; }
    public int GapScore      { get; set; }
}
