namespace SuccessionOS.Domain.Entities;

/// <summary>Dự án hiện tại của nhân viên</summary>
public class CurrentProject
{
    public string Id       { get; set; } = Guid.NewGuid().ToString();
    public string TalentId { get; set; } = "";
    public string Name     { get; set; } = "";
    public string Type     { get; set; } = "";
    public string Role     { get; set; } = "";
    public string Client   { get; set; } = "";
    public string Value    { get; set; } = "";
    public string Status   { get; set; } = "active";
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
