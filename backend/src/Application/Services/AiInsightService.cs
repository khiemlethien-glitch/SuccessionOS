using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace SuccessionOS.Application.Services;

// ─── Request DTO ──────────────────────────────────────────────────────────────

public record TalentInsightRequest(
    string FullName,
    string Position,
    string Department,
    int YearsOfExperience,

    // Nullable — may not exist if sync hasn't run yet
    int? PerformanceScore,
    int? PotentialScore,
    int? RiskScore,
    int? OverallScore,

    string? TalentTier,
    string? ReadinessLevel,

    List<string> RiskReasons,

    // Competencies (all nullable)
    int? Technical,
    int? Leadership,
    int? Communication,
    int? ProblemSolving,
    int? Adaptability
);

// ─── Service ──────────────────────────────────────────────────────────────────

/// <summary>
/// Gọi OpenAI chat completions API để sinh phân tích nhân tài bằng tiếng Việt.
/// Sử dụng IHttpClientFactory named "openai".
/// </summary>
public class AiInsightService(IHttpClientFactory httpFactory, IConfiguration config)
{
    private const string Model       = "gpt-4o-mini";
    private const int    MaxTokens   = 600;
    private const double Temperature = 0.7;

    private const string SystemPrompt =
        "Bạn là chuyên gia HR cao cấp của tập đoàn dầu khí PTSC M&C. " +
        "Bạn phân tích hồ sơ nhân tài và đưa ra đánh giá ngắn gọn, chuyên nghiệp bằng tiếng Việt. " +
        "Trả lời dưới dạng markdown với đúng 4 mục tiêu đề h2.";

    public async Task<string> GenerateTalentInsightAsync(TalentInsightRequest req, CancellationToken ct)
    {
        var apiKey = config["OpenAI:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
            return string.Empty;

        var userPrompt = BuildUserPrompt(req);

        var requestBody = new
        {
            model       = Model,
            max_tokens  = MaxTokens,
            temperature = Temperature,
            messages    = new[]
            {
                new { role = "system", content = SystemPrompt },
                new { role = "user",   content = userPrompt   },
            }
        };

        try
        {
            var http = httpFactory.CreateClient("openai");
            http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", apiKey);

            var response = await http.PostAsJsonAsync(
                "/v1/chat/completions", requestBody, ct);

            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync(ct);
                Console.WriteLine($"[AiInsight] OpenAI error {(int)response.StatusCode}: {error}");
                return string.Empty;
            }

            using var doc = await JsonDocument.ParseAsync(
                await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);

            return doc.RootElement
                       .GetProperty("choices")[0]
                       .GetProperty("message")
                       .GetProperty("content")
                       .GetString() ?? string.Empty;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[AiInsight] Exception: {ex.Message}");
            return string.Empty;
        }
    }

    // ─── Prompt builder ───────────────────────────────────────────────────────

    private static string BuildUserPrompt(TalentInsightRequest r)
    {
        var sb = new System.Text.StringBuilder();

        sb.AppendLine("Phân tích hồ sơ nhân tài sau đây:");
        sb.AppendLine($"- Họ tên: {r.FullName}");
        sb.AppendLine($"- Vị trí: {r.Position}");
        sb.AppendLine($"- Phòng ban: {r.Department}");
        sb.AppendLine($"- Năm kinh nghiệm: {r.YearsOfExperience}");

        if (r.PerformanceScore.HasValue)
            sb.AppendLine($"- Điểm hiệu suất: {r.PerformanceScore}/100");

        if (r.PotentialScore.HasValue)
            sb.AppendLine($"- Điểm tiềm năng: {r.PotentialScore}/100");

        if (r.RiskScore.HasValue)
            sb.AppendLine($"- Điểm rủi ro: {r.RiskScore}/100");

        if (r.OverallScore.HasValue)
            sb.AppendLine($"- Điểm tổng hợp: {r.OverallScore}/100");

        if (!string.IsNullOrEmpty(r.TalentTier))
            sb.AppendLine($"- Phân loại nhân tài: {r.TalentTier}");

        if (!string.IsNullOrEmpty(r.ReadinessLevel))
            sb.AppendLine($"- Mức độ sẵn sàng: {r.ReadinessLevel}");

        if (r.RiskReasons.Count > 0)
            sb.AppendLine($"- Yếu tố rủi ro: {string.Join(", ", r.RiskReasons)}");

        // Competencies — chỉ thêm nếu có ít nhất 1 giá trị
        var hasCompetencies = r.Technical.HasValue || r.Leadership.HasValue ||
                              r.Communication.HasValue || r.ProblemSolving.HasValue ||
                              r.Adaptability.HasValue;
        if (hasCompetencies)
        {
            sb.AppendLine("- Năng lực:");
            if (r.Technical.HasValue)      sb.AppendLine($"  + Kỹ thuật: {r.Technical}/100");
            if (r.Leadership.HasValue)     sb.AppendLine($"  + Lãnh đạo: {r.Leadership}/100");
            if (r.Communication.HasValue)  sb.AppendLine($"  + Giao tiếp: {r.Communication}/100");
            if (r.ProblemSolving.HasValue) sb.AppendLine($"  + Giải quyết vấn đề: {r.ProblemSolving}/100");
            if (r.Adaptability.HasValue)   sb.AppendLine($"  + Thích nghi: {r.Adaptability}/100");
        }

        sb.AppendLine();
        sb.AppendLine("Hãy viết phân tích ngắn gọn (tối đa 500 từ) với đúng 4 mục sau:");
        sb.AppendLine("## Đánh giá tổng quan");
        sb.AppendLine("## Điểm mạnh");
        sb.AppendLine("## Cần phát triển");
        sb.AppendLine("## Khuyến nghị");

        return sb.ToString();
    }
}
