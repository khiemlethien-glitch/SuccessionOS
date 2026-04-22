# BACKEND_PROMPTS.md — SuccessionOS .NET 8 Backend

> Prompt sẵn sàng paste vào Cursor / Claude CLI.
> Mỗi prompt độc lập. Đọc Architecture Overview trước.

---

## Architecture Overview

```
Angular 18 Frontend (localhost:4200)
         │ HTTP (JWT Bearer)
         ▼
SuccessionOS .NET 8 (localhost:5000)
  ├── Proxy layer → VnR HRE (chỉ lấy đúng fields cần thiết, cache mạnh)
  └── Own DB      → Succession-specific data (bảng khởi tạo rỗng, sync dần)
         │
         ▼
VnR HRE API — https://172.21.30.87:7067 (self-signed SSL)
```

### Nguyên tắc thiết kế

| Nguyên tắc | Cách áp dụng |
|---|---|
| **Lấy ít nhất có thể từ VnR HRE** | Chỉ fetch đúng fields frontend cần, không lấy thừa |
| **Cache VnR mạnh** | IMemoryCache 10 phút — HR data ít thay đổi |
| **Bảng rỗng trước, sync sau** | EmployeeExtension tạo trước, data điền dần qua SyncService |
| **Nội suy từ totalScore** | Dùng ContractEvaResult.TotalScore để derive scores, không đợi manual input |
| **Manual override** | HR luôn có thể ghi đè giá trị đã tính |

### Chỉ lấy những fields này từ VnR HRE

| VnR HRE endpoint | Fields lấy | Dùng để |
|---|---|---|
| `GET /api/v1/Hre_Profile` | Id, Name, OrgStructureId, JobTitleId, Email, DateCreate | Employee master list |
| `POST /api/v1/Hre_Profile/GetProfileDetailById` | Id, Name, OrgStructureId, JobTitleId, Email, DateCreate | Employee detail |
| `POST /api/v1/Cat_OrgStructure/list` | Id, Name | Department name lookup |
| `POST /api/v1/Cat_JobTitle/list` | Id, Name | Position name lookup |
| `POST /api/v1/HR_ContractEvaResult/...` | ProfileId, TotalScore, EvaluationDate | Nguồn để tính performanceScore |
| `POST /api/v1/Hre_Promotion/list` | ProfileId, EffectiveDate | Đếm lần thăng tiến → potentialScore |
| `POST /api/v1/HR_Contract/list` | ProfileId, ExpiryDate, ContractType | Rủi ro hợp đồng → riskScore |

> **Không lấy**: EmergencyContact, FamilyMember, Health, IdDocument, MemberShip, HreFile, ContractAnnex, TerminationContract, Address, Religion, Ethnic, ...

### Data ownership

| Data | Nguồn |
|---|---|
| name, email, department, position, hireDate | VnR HRE (proxy + cache) |
| performanceScore, potentialScore, riskScore | Tính từ VnR data → lưu EmployeeExtension |
| talentTier, readinessLevel, overallScore | Derive từ scores → lưu EmployeeExtension |
| isManualOverride | HR tự nhập → EmployeeExtension |
| KeyPosition, SuccessionPlan, IdpPlan | SuccessionOS DB (tự build) |

### Frontend endpoints (sau khi useMock=false)

| Frontend gọi | .NET endpoint |
|---|---|
| `api.get('employees', ...)` | `GET /api/v1/employees` |
| `api.get('key-positions', ...)` | `GET /api/v1/key-positions` |
| `api.get('succession/plans', ...)` | `GET /api/v1/succession/plans` |
| `api.get('idp', ...)` | `GET /api/v1/idp` |

---

## Prompt 1 — EmployeeExtension table + SyncService

```prompt
You are a .NET 8 Web API developer. Build the EmployeeExtension table and SyncService for SuccessionOS.

## Context

SuccessionOS needs succession-specific scores for employees. These don't exist in VnR HRE,
so we derive them from available VnR data and store in our own DB.

**Key principles:**
- Table starts EMPTY. No data required upfront.
- SyncService fetches MINIMAL data from VnR HRE (only what's needed for formulas).
- Derived scores can be manually overridden by HR.
- Frontend handles null scores gracefully (shows "--" or neutral state).

## VnR HRE API info

Base URL: https://172.21.30.87:7067
SSL: self-signed → bypass with DangerousAcceptAnyServerCertificateValidator
Response envelope: { "Data": [...], "Status": 200, "Message": "" }

Only these 3 endpoints are needed for sync:
1. `POST /api/v1/HR_ContractEvaResult/list`  → { ProfileId, TotalScore, EvaluationDate }
2. `POST /api/v1/Hre_Promotion/list`          → { ProfileId, EffectiveDate }
3. `POST /api/v1/HR_Contract/list`            → { ProfileId, ExpiryDate, ContractType }

Request body for each list endpoint: `{ "pageIndex": 1, "pageSize": 9999 }`

## What to build

### 1. EF Core Entity

File: `Domain/Entities/EmployeeExtension.cs`

```csharp
public class EmployeeExtension
{
    public string VnrProfileId { get; set; } = "";          // PK — khớp với VnR Hre_Profile.Id
    public int?   PerformanceScore { get; set; }             // 0-100, nullable = chưa sync
    public int?   PotentialScore   { get; set; }             // 0-100
    public int?   RiskScore        { get; set; }             // 0-100
    public string? TalentTier      { get; set; }             // "Core"|"Potential"|"Successor"|null
    public string? ReadinessLevel  { get; set; }             // "Ready Now"|"1-2 Years"|"3+ Years"|null
    public int?    OverallScore    { get; set; }             // 0-100
    public CompetencyScores? Competencies { get; set; }      // JSON column, nullable
    public List<string> RiskReasons { get; set; } = new();  // JSON column
    public bool   IsManualOverride  { get; set; } = false;  // true → không tính lại khi sync
    public DateTime? LastSyncedAt   { get; set; }
    public DateTime  UpdatedAt      { get; set; } = DateTime.UtcNow;
}

public class CompetencyScores
{
    public int Technical      { get; set; }
    public int Leadership     { get; set; }
    public int Communication  { get; set; }
    public int ProblemSolving { get; set; }
    public int Adaptability   { get; set; }
}
```

Add to DbContext: `DbSet<EmployeeExtension> EmployeeExtensions`
Configure JSON columns in OnModelCreating for Competencies and RiskReasons.
Primary key: VnrProfileId (string).

### 2. SyncService — công thức nội suy

File: `Application/Services/EmployeeSyncService.cs`

Inject: `SuccessionDbContext _db`, `VnrHreClient _vnr`

```csharp
public async Task SyncAllAsync(CancellationToken ct)
{
    // Fetch ONLY these 3 datasets from VnR — nothing else
    var evaResults = await _vnr.GetContractEvaResultsAsync(ct);  // TotalScore
    var promotions = await _vnr.GetPromotionsAsync(ct);          // EffectiveDate per ProfileId
    var contracts  = await _vnr.GetContractsAsync(ct);           // ExpiryDate per ProfileId

    // Group by profileId
    var evaByProfile   = evaResults.GroupBy(e => e.ProfileId)
                                   .ToDictionary(g => g.Key, g => g.OrderByDescending(e => e.EvaluationDate).First());
    var promoByProfile = promotions.GroupBy(p => p.ProfileId)
                                   .ToDictionary(g => g.Key, g => g.ToList());
    var contractByProfile = contracts.GroupBy(c => c.ProfileId)
                                     .ToDictionary(g => g.Key, g => g.OrderByDescending(c => c.ExpiryDate).First());

    var allProfileIds = evaByProfile.Keys
        .Union(promoByProfile.Keys)
        .Union(contractByProfile.Keys)
        .Distinct();

    foreach (var profileId in allProfileIds)
    {
        // Skip nếu HR đã override thủ công
        var existing = await _db.EmployeeExtensions.FindAsync(profileId);
        if (existing?.IsManualOverride == true) continue;

        var ext = existing ?? new EmployeeExtension { VnrProfileId = profileId };

        // ── performanceScore ────────────────────────────────────────────
        // Nguồn: ContractEvaResult.TotalScore (thang VnR, normalize về 0-100)
        if (evaByProfile.TryGetValue(profileId, out var eva))
        {
            // TotalScore của VnR thường thang 100. Nếu thang khác, điều chỉnh hệ số.
            ext.PerformanceScore = Math.Clamp((int)Math.Round(eva.TotalScore), 0, 100);
        }

        // ── potentialScore ───────────────────────────────────────────────
        // Công thức: 40% tần suất thăng tiến + 35% xu hướng performance + 25% thâm niên
        var promos = promoByProfile.GetValueOrDefault(profileId) ?? new();
        var recentPromos = promos.Count(p => p.EffectiveDate >= DateTime.UtcNow.AddYears(-3));
        var promoFactor = Math.Min(recentPromos * 25, 100); // 0 lần=0, 1=25, 2=50, 3+=75+

        var perfTrend = 50; // default neutral nếu chỉ có 1 kỳ đánh giá
        // (Mở rộng sau: so sánh TotalScore kỳ này vs kỳ trước)

        var tenureYears = (DateTime.UtcNow - (DateTime.UtcNow.AddYears(-3))).Days / 365; // placeholder
        var tenureFactor = tenureYears switch { < 1 => 30, < 3 => 55, < 7 => 75, < 15 => 85, _ => 70 };

        ext.PotentialScore = Math.Clamp(
            (int)Math.Round(promoFactor * 0.40 + perfTrend * 0.35 + tenureFactor * 0.25), 0, 100);

        // ── riskScore ────────────────────────────────────────────────────
        // Công thức: 40% rủi ro hợp đồng + 35% hiệu suất thấp + 25% không thăng tiến lâu
        var riskReasons = new List<string>();
        var contractRisk = 0;
        if (contractByProfile.TryGetValue(profileId, out var contract))
        {
            var daysToExpiry = (contract.ExpiryDate - DateTime.UtcNow).Days;
            if (daysToExpiry < 90)  { contractRisk = 90; riskReasons.Add("Hợp đồng sắp hết hạn"); }
            else if (daysToExpiry < 180) { contractRisk = 60; riskReasons.Add("Hợp đồng hết hạn < 6 tháng"); }
            else contractRisk = 10;
        }

        var perfRisk = ext.PerformanceScore.HasValue
            ? Math.Max(0, 100 - ext.PerformanceScore.Value)  // perf thấp → risk cao
            : 50;
        if (ext.PerformanceScore < 50) riskReasons.Add("Hiệu suất thấp");

        var stagnationRisk = recentPromos == 0 ? 70 : 10;
        if (recentPromos == 0) riskReasons.Add("Chưa thăng tiến trong 3 năm");

        ext.RiskScore = Math.Clamp(
            (int)Math.Round(contractRisk * 0.40 + perfRisk * 0.35 + stagnationRisk * 0.25), 0, 100);
        ext.RiskReasons = riskReasons;

        // ── talentTier ───────────────────────────────────────────────────
        ext.TalentTier = (ext.PerformanceScore, ext.PotentialScore) switch
        {
            ( >= 80, >= 75) => "Core",
            ( >= 65, >= 60) => "Potential",
            ( >= 50, _    ) => "Successor",
            _               => null   // chưa đủ data để phân loại
        };

        // ── overallScore ─────────────────────────────────────────────────
        if (ext.PerformanceScore.HasValue && ext.PotentialScore.HasValue)
            ext.OverallScore = (int)Math.Round(
                ext.PerformanceScore.Value * 0.6 + ext.PotentialScore.Value * 0.4);

        // ── readinessLevel ───────────────────────────────────────────────
        ext.ReadinessLevel = ext.OverallScore switch
        {
            >= 85 => "Ready Now",
            >= 70 => "1-2 Years",
            _     => "3+ Years"
        };

        ext.LastSyncedAt = DateTime.UtcNow;
        ext.UpdatedAt    = DateTime.UtcNow;

        if (existing == null) _db.EmployeeExtensions.Add(ext);
    }

    await _db.SaveChangesAsync(ct);
}
```

### 3. VnrHreClient — chỉ 3 methods cần cho sync

File: `Infrastructure/VnrHre/VnrHreClient.cs`

```csharp
// Registered as HttpClient "vnr-hre" with SSL bypass in Program.cs

// Internal records — chỉ lấy đúng fields cần
private record VnrContractEvaResult(string ProfileId, double TotalScore, DateTime EvaluationDate);
private record VnrPromotion(string ProfileId, DateTime EffectiveDate);
private record VnrContract(string ProfileId, DateTime ExpiryDate, string ContractType);

private static readonly object ListBody = new { pageIndex = 1, pageSize = 9999 };

public Task<List<VnrContractEvaResult>> GetContractEvaResultsAsync(CancellationToken ct)
    => PostListAsync<VnrContractEvaResult>("/api/v1/HR_ContractEvaResult/list", ct);

public Task<List<VnrPromotion>> GetPromotionsAsync(CancellationToken ct)
    => PostListAsync<VnrPromotion>("/api/v1/Hre_Promotion/list", ct);

public Task<List<VnrContract>> GetContractsAsync(CancellationToken ct)
    => PostListAsync<VnrContract>("/api/v1/HR_Contract/list", ct);

private async Task<List<T>> PostListAsync<T>(string path, CancellationToken ct)
{
    var resp = await _http.PostAsJsonAsync(path, ListBody, ct);
    resp.EnsureSuccessStatusCode();
    var envelope = await resp.Content.ReadFromJsonAsync<VnrEnvelope<T>>(cancellationToken: ct);
    return envelope?.Data ?? new();
}

// VnR response envelope
private record VnrEnvelope<T>(List<T>? Data, int Status, string? Message);
```

### 4. Sync endpoint

File: `API/Controllers/EmployeesController.cs` (thêm vào)

```csharp
[HttpPost("sync")]
public async Task<IActionResult> Sync([FromServices] EmployeeSyncService svc, CancellationToken ct)
{
    await svc.SyncAllAsync(ct);
    return Ok(new { message = "Sync completed", syncedAt = DateTime.UtcNow });
}
```

### 5. Manual override endpoint

```csharp
[HttpPatch("{id}/scores")]
public async Task<IActionResult> OverrideScores(string id, [FromBody] OverrideScoresRequest req, CancellationToken ct)
{
    var ext = await _db.EmployeeExtensions.FindAsync(id);
    if (ext == null) return NotFound();

    if (req.PerformanceScore.HasValue) ext.PerformanceScore = req.PerformanceScore;
    if (req.PotentialScore.HasValue)   ext.PotentialScore   = req.PotentialScore;
    if (req.RiskScore.HasValue)        ext.RiskScore        = req.RiskScore;
    if (req.TalentTier != null)        ext.TalentTier       = req.TalentTier;
    ext.IsManualOverride = true;
    ext.UpdatedAt = DateTime.UtcNow;
    await _db.SaveChangesAsync(ct);
    return Ok(ext);
}

public record OverrideScoresRequest(int? PerformanceScore, int? PotentialScore, int? RiskScore, string? TalentTier);
```

### Notes
- Chạy `POST /api/v1/employees/sync` thủ công lần đầu để seed data.
- Sau đó set cron job chạy hàng tuần hoặc sau mỗi kỳ đánh giá.
- IsManualOverride = true → SyncService bỏ qua, không ghi đè.
- TalentTier null = "Chưa phân bổ" khi frontend render.
- Không fetch health, family, ID document, membership từ VnR — không cần.
```

---

## Prompt 2 — Employee List + Detail (GET /api/v1/employees)

```prompt
You are a .NET 8 Web API developer. Build the Employee endpoints for SuccessionOS.

## Context

GET /api/v1/employees và GET /api/v1/employees/{id} trả về data merge từ:
1. VnR HRE → master data (name, dept, position, email, hireDate)
2. SuccessionOS EmployeeExtension table → scores (có thể null nếu chưa sync)

**Chỉ fetch những fields này từ VnR HRE — không lấy thêm:**
- Hre_Profile: Id, Name, OrgStructureId, JobTitleId, Email, DateCreate
- Cat_OrgStructure: Id, Name  (cached 10 phút)
- Cat_JobTitle: Id, Name      (cached 10 phút)

## VnR HRE endpoints

Base: https://172.21.30.87:7067 (bypass SSL)

- `GET  /api/v1/Hre_Profile`                            → danh sách (lấy: Id, Name, OrgStructureId, JobTitleId, Email, DateCreate)
- `POST /api/v1/Hre_Profile/GetProfileDetailById`       → body: `{ "id": "..." }` → 1 record
- `POST /api/v1/Cat_OrgStructure/list`                  → body: `{ "pageIndex":1,"pageSize":9999 }` → lấy Id, Name
- `POST /api/v1/Cat_JobTitle/list`                      → body: `{ "pageIndex":1,"pageSize":9999 }` → lấy Id, Name

## Response shape frontend cần

```json
{
  "data": [{
    "id": "abc-guid",
    "fullName": "Nguyễn Văn An",
    "position": "Trưởng phòng Kỹ thuật",
    "department": "Kỹ thuật",
    "email": "an.nv@ptscmc.vn",
    "hireDate": "2018-03-15",
    "yearsOfExperience": 6,
    "talentTier": "Core",
    "performanceScore": 85,
    "potentialScore": 78,
    "riskScore": 20,
    "overallScore": 82,
    "readinessLevel": "Ready Now",
    "riskReasons": [],
    "competencies": { "technical": 80, "leadership": 75, "communication": 70, "problemSolving": 72, "adaptability": 68 }
  }],
  "total": 25
}
```

Nếu EmployeeExtension chưa có row cho employee đó → trả null/default cho tất cả score fields.
Frontend xử lý null bằng cách hiển thị "--" hoặc 0.

## What to build

### 1. VnrHreClient — chỉ 4 methods

```csharp
// Minimal VnR records — chỉ fields cần dùng
record VnrProfile(string Id, string Name, string? OrgStructureId, string? JobTitleId, string? Email, DateTime? DateCreate);
record VnrLookup(string Id, string Name);  // dùng cho cả OrgStructure lẫn JobTitle

public Task<List<VnrProfile>> GetProfilesAsync(CancellationToken ct)
    => GetAsync<VnrProfile>("/api/v1/Hre_Profile", ct);

public Task<VnrProfile?> GetProfileByIdAsync(string id, CancellationToken ct)
    => PostSingleAsync<VnrProfile>("/api/v1/Hre_Profile/GetProfileDetailById", new { id }, ct);

// Cache 10 phút — department/position ít thay đổi
public Task<Dictionary<string, string>> GetOrgLookupAsync(IMemoryCache cache, CancellationToken ct)
    => GetLookupCachedAsync("vnr_org", "/api/v1/Cat_OrgStructure/list", cache, ct);

public Task<Dictionary<string, string>> GetJobTitleLookupAsync(IMemoryCache cache, CancellationToken ct)
    => GetLookupCachedAsync("vnr_jobtitle", "/api/v1/Cat_JobTitle/list", cache, ct);

private async Task<Dictionary<string, string>> GetLookupCachedAsync(
    string cacheKey, string path, IMemoryCache cache, CancellationToken ct)
{
    return await cache.GetOrCreateAsync(cacheKey, async entry =>
    {
        entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10);
        var items = await PostListAsync<VnrLookup>(path, new { pageIndex = 1, pageSize = 9999 }, ct);
        return items.ToDictionary(x => x.Id, x => x.Name);
    }) ?? new();
}
```

### 2. EmployeesController

```csharp
[Route("api/v1/employees")]
public class EmployeesController : ControllerBase
{
    // Inject: VnrHreClient _vnr, SuccessionDbContext _db, IMemoryCache _cache

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? department,
        [FromQuery] string? tier,
        CancellationToken ct)
    {
        // Parallel fetch: profiles + lookups + extensions
        var (profiles, orgLookup, jobLookup, extensions) = await (
            _vnr.GetProfilesAsync(ct),
            _vnr.GetOrgLookupAsync(_cache, ct),
            _vnr.GetJobTitleLookupAsync(_cache, ct),
            _db.EmployeeExtensions.ToDictionaryAsync(e => e.VnrProfileId, ct)
        ).WhenAll();

        var data = profiles
            .Select(p => MapToDto(p, orgLookup, jobLookup, extensions.GetValueOrDefault(p.Id)))
            .Where(d => department == null || d.Department == department)
            .Where(d => tier == null || d.TalentTier == tier)
            .ToList();

        return Ok(new { data, total = data.Count });
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id, CancellationToken ct)
    {
        var (profile, orgLookup, jobLookup, ext) = await (
            _vnr.GetProfileByIdAsync(id, ct),
            _vnr.GetOrgLookupAsync(_cache, ct),
            _vnr.GetJobTitleLookupAsync(_cache, ct),
            _db.EmployeeExtensions.FindAsync(id, ct).AsTask()
        ).WhenAll();

        if (profile == null) return NotFound();
        return Ok(MapToDto(profile, orgLookup, jobLookup, ext));
    }

    [HttpGet("/api/v1/departments")]
    public async Task<IActionResult> GetDepartments(CancellationToken ct)
    {
        var lookup = await _vnr.GetOrgLookupAsync(_cache, ct);
        var data = lookup.Select(kv => new { id = kv.Key, name = kv.Value });
        return Ok(new { data });
    }

    private static EmployeeDto MapToDto(
        VnrProfile p,
        Dictionary<string, string> org,
        Dictionary<string, string> jobs,
        EmployeeExtension? ext)
    {
        var hireDate = p.DateCreate ?? DateTime.UtcNow;
        return new EmployeeDto(
            Id:               p.Id,
            FullName:         p.Name,
            Department:       org.GetValueOrDefault(p.OrgStructureId ?? "", "—"),
            Position:         jobs.GetValueOrDefault(p.JobTitleId ?? "", "—"),
            Email:            p.Email ?? "",
            HireDate:         hireDate.ToString("yyyy-MM-dd"),
            YearsOfExperience: (int)((DateTime.UtcNow - hireDate).TotalDays / 365),
            TalentTier:        ext?.TalentTier,
            PerformanceScore:  ext?.PerformanceScore,
            PotentialScore:    ext?.PotentialScore,
            RiskScore:         ext?.RiskScore,
            OverallScore:      ext?.OverallScore,
            ReadinessLevel:    ext?.ReadinessLevel,
            RiskReasons:       ext?.RiskReasons ?? new(),
            Competencies:      ext?.Competencies
        );
    }
}
```

### Notes
- Chỉ 4 VnR endpoints được gọi. Không gọi Health, Family, Contract, Certificate, v.v.
- Cache org + jobTitle 10 phút. Không cache profiles (có thể thêm người mới).
- Nullable score fields → frontend đã handle, hiển thị "--".
- `WhenAll()` extension: `Task.WhenAll` trả tuple, implement extension hoặc dùng `await Task.WhenAll(t1,t2,t3,t4)` rồi `.Result`.
```

---

## Prompt 3 — Key Positions + Succession Plans

```prompt
You are a .NET 8 Web API developer. Build Key Positions và Succession Plans cho SuccessionOS.

## Context

Cả hai module đều lưu trong SuccessionOS DB. Không có data từ VnR HRE.
Bảng khởi tạo rỗng. Frontend hiện đang dùng mock JSON — khi backend live, frontend flip useMock=false.

## Response shapes

### Key Position
```json
{
  "id": "P001",
  "title": "Director Quản lý Dự án",
  "department": "Quản lý dự án",
  "currentHolder": "Nguyễn Văn Bình",
  "incumbentId": null,
  "criticalLevel": "Critical",
  "riskLevel": "High",
  "successorCount": 2,
  "readyNowCount": 1,
  "parentId": "P101",
  "requiredCompetencies": ["leadership", "communication"],
  "successors": ["emp-guid-1", "emp-guid-2"]
}
```

riskLevel computed: successorCount==0 → "High"; readyNowCount==0 → "High"; readyNowCount<2 → "Medium"; else "Low"

### Succession Plan
```json
{
  "id": "SP001",
  "positionId": "P001",
  "positionTitle": "Director Quản lý Dự án",
  "department": "Quản lý dự án",
  "successors": [
    { "talentId": "emp-guid-1", "talentName": "Trần Thị Bình", "readiness": "Ready Now", "priority": 1, "gapScore": 5 }
  ]
}
```

## What to build

### 1. Entities

```csharp
// Domain/Entities/KeyPosition.cs
public class KeyPosition
{
    public string Id               { get; set; } = Guid.NewGuid().ToString();
    public string Title            { get; set; } = "";
    public string Department       { get; set; } = "";
    public string CurrentHolder    { get; set; } = "";
    public string? IncumbentId     { get; set; }
    public string CriticalLevel    { get; set; } = "Medium"; // Critical|High|Medium|Low
    public string? ParentId        { get; set; }
    public List<string> RequiredCompetencies { get; set; } = new(); // JSON column
    public List<string> SuccessorIds         { get; set; } = new(); // JSON column
    public bool IsDeleted          { get; set; } = false;
    public DateTime CreatedAt      { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt      { get; set; } = DateTime.UtcNow;
}

// Domain/Entities/SuccessionPlan.cs
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
```

Configure JSON columns cho List<string> và List<SuccessorEntry> trong OnModelCreating.

### 2. Controllers

**KeyPositionsController** — `[Route("api/v1/key-positions")]`

```
GET    /api/v1/key-positions        → list all (IsDeleted=false), compute riskLevel
GET    /api/v1/key-positions/{id}   → single, 404 if not found
POST   /api/v1/key-positions        → create, validate Title+Department required, return 201
PUT    /api/v1/key-positions/{id}   → patch non-null fields, return 200
DELETE /api/v1/key-positions/{id}   → soft delete (IsDeleted=true), return 204
```

**SuccessionController** — `[Route("api/v1/succession")]`

```
GET /api/v1/succession/plans           → list all plans → { data: [...], total: n }
GET /api/v1/succession/plans/{id}      → single plan
GET /api/v1/succession/employee/{id}   → plans where any successor.talentId == id
GET /api/v1/succession/nine-box        → EmployeeExtension all records
                                          (Id, PerformanceScore, PotentialScore, TalentTier, FullName*)
                                          *FullName: join từ VnR cache hoặc để frontend resolve
POST /api/v1/succession/plans          → create/upsert by positionId
PUT  /api/v1/succession/plans/{id}     → update successors list
```

### Notes
- Tất cả CRUD lưu vào SuccessionOS DB. Không gọi VnR trong 2 module này.
- nine-box chỉ cần: Id + PerformanceScore + PotentialScore + TalentTier → đủ để render 9-Box trên frontend.
  FullName có thể lấy từ cache VnR nếu tiện, không bắt buộc ngay.
- Migrations: `dotnet ef migrations add AddKeyPositions` và `dotnet ef migrations add AddSuccessionPlans`.
- Register repos trong Program.cs với AddScoped.
```

---

## Prompt 4 — Dashboard KPI (GET /api/v1/dashboard/kpi)

```prompt
You are a .NET 8 Web API developer. Build the Dashboard KPI endpoint for SuccessionOS.

## Context

Frontend Dashboard hiện gọi 3 API riêng (employees + key-positions + idp) để tính KPI.
Endpoint /api/v1/dashboard/kpi thay thế cả 3, trả về aggregated result trong 1 call.

## Response shape

```json
{
  "totalTalents": 25,
  "tierCounts": { "Core": 8, "Potential": 10, "Successor": 5, "Unassigned": 2 },
  "positionsWithSuccessors": 9,
  "positionsNoSuccessor": 3,
  "highRiskTalents": 4,
  "activeIdps": 12,
  "avgIdpProgress": 67,
  "topRisk": [
    { "id": "x", "fullName": "Đỗ Thanh Giang", "position": "Ops Manager", "riskScore": 80, "riskReasons": ["..."] }
  ]
}
```

## What to build

### IdpPlan Entity (nếu chưa có)

```csharp
public class IdpPlan
{
    public string Id          { get; set; } = Guid.NewGuid().ToString();
    public string TalentId    { get; set; } = "";
    public string TalentName  { get; set; } = "";
    public int Year           { get; set; }
    public string Status      { get; set; } = "Pending"; // Active|Pending|Completed
    public int OverallProgress{ get; set; }               // 0-100
}
```

### DashboardController — `[Route("api/v1/dashboard")]`

```csharp
[HttpGet("kpi")]
public async Task<IActionResult> GetKpi(CancellationToken ct)
{
    // 3 queries song song — tất cả từ SuccessionOS DB, không gọi VnR
    var (extensions, positions, idps) = await (
        _db.EmployeeExtensions.ToListAsync(ct),
        _db.KeyPositions.Where(p => !p.IsDeleted).ToListAsync(ct),
        _db.IdpPlans.ToListAsync(ct)
    ).WhenAll();

    var activeIdps = idps.Where(i => i.Status == "Active").ToList();
    var highRisk   = extensions.Where(e => e.RiskScore >= 60)
                               .OrderByDescending(e => e.RiskScore)
                               .Take(3).ToList();

    // TotalTalents: dùng count từ EmployeeExtension nếu đã sync đủ
    // Nếu chưa sync: gọi VnR một lần để count (không lấy data)
    int totalTalents = extensions.Count > 0
        ? extensions.Count
        : (await _vnr.GetProfilesAsync(ct)).Count;

    var tierCounts = extensions
        .GroupBy(e => e.TalentTier ?? "Unassigned")
        .ToDictionary(g => g.Key, g => g.Count());

    return Ok(new {
        totalTalents,
        tierCounts,
        positionsWithSuccessors = positions.Count(p => p.SuccessorIds.Any()),
        positionsNoSuccessor    = positions.Count(p => !p.SuccessorIds.Any()),
        highRiskTalents         = extensions.Count(e => e.RiskScore >= 60),
        activeIdps              = activeIdps.Count,
        avgIdpProgress          = activeIdps.Count > 0 ? (int)activeIdps.Average(i => i.OverallProgress) : 0,
        topRisk = highRisk.Select(e => new {
            id         = e.VnrProfileId,
            riskScore  = e.RiskScore,
            riskReasons= e.RiskReasons
            // fullName + position: frontend resolve từ employees list đã cached
        })
    });
}
```

### Notes
- Toàn bộ tính từ SuccessionOS DB. VnR chỉ gọi fallback khi chưa sync.
- Cache response 2 phút với IMemoryCache (KPI không cần real-time).
- topRisk không cần fullName/position ngay — frontend có employees list, tự map theo id.
- Khi EmployeeExtension chưa có data (chưa sync lần nào) → trả về zeros, frontend hiển thị "--".
- Migration: `dotnet ef migrations add AddIdpPlans`.
```
