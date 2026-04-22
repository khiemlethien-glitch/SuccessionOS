namespace SuccessionOS.Domain.Entities;

/// <summary>Kết quả đánh giá 360° — lưu mỗi kỳ 1 row per talent</summary>
public class Assessment360
{
    public string Id        { get; set; } = Guid.NewGuid().ToString();
    public string TalentId  { get; set; } = "";
    public string Period    { get; set; } = "";
    public double Overall   { get; set; }
    public double Benchmark { get; set; }
    public List<Assessment360Source>   Sources  { get; set; } = new();  // JSON
    public List<Assessment360Criteria> Criteria { get; set; } = new();  // JSON
    public List<string> Strengths { get; set; } = new();                // JSON
    public List<string> NeedsDev  { get; set; } = new();                // JSON
    public string ManagerNote { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Assessment360Source   { public string Label { get; set; } = ""; public int Pct { get; set; } }
public class Assessment360Criteria { public string Label { get; set; } = ""; public double Score { get; set; } }
