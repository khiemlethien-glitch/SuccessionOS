namespace SuccessionOS.Domain.Entities;

public class KeyPosition
{
    public string Id             { get; set; } = Guid.NewGuid().ToString();
    public string Title          { get; set; } = "";
    public string Department     { get; set; } = "";
    public string CurrentHolder  { get; set; } = "";
    public string? IncumbentId   { get; set; }
    public string CriticalLevel  { get; set; } = "Medium"; // Critical|High|Medium|Low
    public string? ParentId      { get; set; }
    public List<string> RequiredCompetencies { get; set; } = new(); // JSON column
    public List<string> SuccessorIds         { get; set; } = new(); // JSON column
    public bool IsDeleted        { get; set; } = false;
    public DateTime CreatedAt    { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt    { get; set; } = DateTime.UtcNow;
}
