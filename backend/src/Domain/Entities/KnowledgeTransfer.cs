namespace SuccessionOS.Domain.Entities;

/// <summary>Kế hoạch chuyển giao tri thức từ nhân viên → người kế thừa</summary>
public class KnowledgeTransfer
{
    public string Id              { get; set; } = Guid.NewGuid().ToString();
    public string TalentId        { get; set; } = "";
    public string Successor       { get; set; } = "";
    public string SuccessorRole   { get; set; } = "";
    public string StartDate       { get; set; } = "";
    public string TargetDate      { get; set; } = "";
    public int    OverallProgress { get; set; }
    public List<KtpItem> Items    { get; set; } = new();  // JSON
    public DateTime UpdatedAt     { get; set; } = DateTime.UtcNow;
}

public class KtpItem
{
    public string Title    { get; set; } = "";
    public string Category { get; set; } = "";
    public string Status   { get; set; } = "";
    public int    Progress { get; set; }
}
