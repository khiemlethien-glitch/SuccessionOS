using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using SuccessionOS.Infrastructure.VnrHre;

namespace SuccessionOS.API.Controllers;

[ApiController]
[Route("api/v1/departments")]
public class DepartmentsController(VnrHreClient vnr, IMemoryCache cache) : ControllerBase
{
    // ─── GET /api/v1/departments ──────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var lookup = await vnr.GetOrgLookupAsync(cache, ct);
        var data   = lookup.Select(kv => new { id = kv.Key, name = kv.Value }).ToList();
        return Ok(new { data, total = data.Count });
    }
}
