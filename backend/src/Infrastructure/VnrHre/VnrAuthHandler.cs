using System.Net.Http.Headers;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

namespace SuccessionOS.Infrastructure.VnrHre;

/// <summary>
/// DelegatingHandler: tự động forward OIDC JWT token của user
/// từ Angular request → VnR HRE API request.
///
/// Priority:
///   1. Authorization header từ current HTTP context (user đang đăng nhập via SSO)
///   2. VnrHre:BearerToken trong appsettings (dev override thủ công)
///
/// Nếu không có token nào → request đến VnR không có Authorization header
/// → VnR trả 401/500 (cần user login trước).
/// </summary>
public class VnrAuthHandler(
    IHttpContextAccessor httpContextAccessor,
    IConfiguration configuration) : DelegatingHandler
{
    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var token = ExtractToken();

        if (!string.IsNullOrWhiteSpace(token))
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        return base.SendAsync(request, cancellationToken);
    }

    private string? ExtractToken()
    {
        // 1. Token từ incoming request của user (SSO login)
        var authHeader = httpContextAccessor.HttpContext?
            .Request.Headers.Authorization.ToString();

        if (!string.IsNullOrWhiteSpace(authHeader))
        {
            // "Bearer eyJ..." → "eyJ..."
            return authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
                ? authHeader["Bearer ".Length..].Trim()
                : authHeader.Trim();
        }

        // 2. Static fallback từ appsettings (dùng khi dev/test không qua SSO)
        var staticToken = configuration["VnrHre:BearerToken"];
        return string.IsNullOrWhiteSpace(staticToken) ? null : staticToken;
    }
}
