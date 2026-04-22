# backendReport.md — SuccessionOS .NET 8 Backend

> Tổng kết toàn bộ công việc build backend.
> Ngày hoàn thành: 2026-04-22

---

## 1. Tổng quan

Backend được build từ đầu theo 4 prompt trong `BACKEND_PROMPTS.md`.
Stack: **.NET 8 Web API · EF Core 8.0.11 · SQLite · IMemoryCache**.

```
Angular 18 Frontend (localhost:4200)
         │ HTTP Bearer JWT
         ▼
SuccessionOS .NET 8 (localhost:5000)
  ├── Proxy layer → VnR HRE 172.21.30.87:7067  (SSL bypass, cache 10 phút)
  └── Own DB      → succession.db (SQLite, tự tạo khi start)
```

---

## 2. Cấu trúc thư mục

```
backend/
├── Program.cs
├── SuccessionOS.csproj
└── src/
    ├── Domain/Entities/
    │   ├── EmployeeExtension.cs     Prompt 1 — scores + sync metadata
    │   ├── KeyPosition.cs           Prompt 3 — vị trí then chốt
    │   ├── SuccessionPlan.cs        Prompt 3 — kế hoạch kế thừa
    │   └── IdpPlan.cs               Prompt 4 — kế hoạch phát triển cá nhân
    ├── Infrastructure/
    │   ├── Data/
    │   │   └── SuccessionDbContext.cs   4 DbSets + JSON column config
    │   └── VnrHre/
    │       └── VnrHreClient.cs      HttpClient SSL bypass, 7 methods
    ├── Application/Services/
    │   └── EmployeeSyncService.cs   Công thức nội suy 3-factor từ VnR data
    └── API/Controllers/
        ├── EmployeesController.cs   GET list/detail · POST sync · PATCH override
        ├── DepartmentsController.cs GET /departments
        ├── KeyPositionsController.cs Full CRUD (GET/POST/PUT/DELETE)
        ├── SuccessionController.cs  Plans + nine-box
        └── DashboardController.cs  KPI aggregated, cache 2 phút
```

---

## 3. Entities & Database

### EmployeeExtension
```
PK: VnrProfileId (string — khớp VnR Hre_Profile.Id)
Fields: PerformanceScore, PotentialScore, RiskScore (int?, 0-100)
        TalentTier ("Core"|"Potential"|"Successor"|null)
        ReadinessLevel ("Ready Now"|"1-2 Years"|"3+ Years"|null)
        OverallScore (int?)
        Competencies (JSON: Technical, Leadership, Communication, ProblemSolving, Adaptability)
        RiskReasons (JSON: List<string>)
        IsManualOverride (bool) — true → SyncService bỏ qua
        LastSyncedAt, UpdatedAt
```

### KeyPosition
```
PK: Id (Guid string)
Fields: Title, Department, CurrentHolder, IncumbentId?
        CriticalLevel ("Critical"|"High"|"Medium"|"Low")
        ParentId? (self-reference cho org tree)
        RequiredCompetencies (JSON: List<string>)
        SuccessorIds (JSON: List<string>)
        IsDeleted (soft delete)
        CreatedAt, UpdatedAt
```

### SuccessionPlan
```
PK: Id (Guid string)
Fields: PositionId, PositionTitle, Department
        Successors (JSON: List<SuccessorEntry>)
          └── SuccessorEntry: TalentId, TalentName, Readiness, Priority, GapScore
```

### IdpPlan
```
PK: Id (Guid string)
Fields: TalentId, TalentName, Year, Status ("Active"|"Pending"|"Completed")
        OverallProgress (int, 0-100)
```

---

## 4. VnR HRE Client

File: `Infrastructure/VnrHre/VnrHreClient.cs`

- SSL bypass: `DangerousAcceptAnyServerCertificateValidator` (VnR dùng self-signed cert)
- Base URL: `https://172.21.30.87:7067` (config qua `VnrHre:BaseUrl` trong appsettings)
- Response envelope: `{ "Data": [...], "Status": 200, "Message": "" }`

**7 methods — chỉ fetch đúng fields cần:**

| Method | VnR Endpoint | Dùng cho |
|---|---|---|
| `GetContractEvaResultsAsync` | `POST /HR_ContractEvaResult/list` | Sync: performanceScore |
| `GetPromotionsAsync` | `POST /Hre_Promotion/list` | Sync: potentialScore |
| `GetContractsAsync` | `POST /HR_Contract/list` | Sync: riskScore |
| `GetProfilesAsync` | `GET /Hre_Profile` | Employee list |
| `GetProfileByIdAsync` | `POST /Hre_Profile/GetProfileDetailById` | Employee detail |
| `GetOrgLookupAsync` | `POST /Cat_OrgStructure/list` | Department name (cache 10 phút) |
| `GetJobTitleLookupAsync` | `POST /Cat_JobTitle/list` | Position name (cache 10 phút) |

---

## 5. SyncService — Công thức nội suy

File: `Application/Services/EmployeeSyncService.cs`

Trigger bằng `POST /api/v1/employees/sync`. Mỗi lần sync:
1. Fetch 3 datasets từ VnR (song song)
2. Với mỗi `profileId` — **bỏ qua nếu `IsManualOverride=true`**
3. Tính scores theo công thức:

```
performanceScore = ContractEvaResult.TotalScore (clamp 0-100)

potentialScore   = promoFactor×0.40 + perfTrend×0.35 + tenureFactor×0.25
  promoFactor    = min(recentPromos3y × 25, 100)
  perfTrend      = 50 (neutral, mở rộng khi có nhiều kỳ đánh giá)

riskScore        = contractRisk×0.40 + perfRisk×0.35 + stagnationRisk×0.25
  contractRisk   = 90 nếu hết hạn <90 ngày · 60 nếu <180 ngày · 10 nếu ổn
  perfRisk       = max(0, 100 − performanceScore)
  stagnationRisk = 70 nếu 0 lần thăng tiến trong 3 năm · else 10

talentTier       = (perf≥80 AND pot≥75) → "Core"
                   (perf≥65 AND pot≥60) → "Potential"
                   (perf≥50)            → "Successor"
                   else null

overallScore     = perf×0.6 + pot×0.4

readinessLevel   = overallScore≥85 → "Ready Now"
                   overallScore≥70 → "1-2 Years"
                   else            → "3+ Years"
```

---

## 6. API Endpoints

### Employees

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/api/v1/employees` | List tất cả, filter `?department=` `?tier=` |
| `GET` | `/api/v1/employees/{id}` | Single employee |
| `POST` | `/api/v1/employees/sync` | Chạy SyncService — seed/update EmployeeExtension |
| `PATCH` | `/api/v1/employees/{id}/scores` | Override thủ công scores (set `IsManualOverride=true`) |

Response shape `GET /employees`:
```json
{
  "data": [{
    "id": "abc",
    "fullName": "Nguyễn Văn An",
    "department": "Kỹ thuật",
    "position": "Trưởng phòng",
    "email": "an@ptscmc.vn",
    "hireDate": "2018-03-15",
    "yearsOfExperience": 6,
    "talentTier": "Nòng cốt",
    "potentialLevel": "High",
    "performanceScore": 85,
    "potentialScore": 78,
    "riskScore": 20,
    "overallScore": 82,
    "readinessLevel": "Ready Now",
    "riskReasons": [],
    "competencies": { "technical": 80, "leadership": 75, ... }
  }],
  "total": 25
}
```

> **Mapping Vietnamese:** Backend lưu `"Core"/"Potential"/"Successor"` → DTO trả `"Nòng cốt"/"Tiềm năng"/"Kế thừa"` đúng format frontend.

### Departments

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/api/v1/departments` | List departments từ VnR cache |

### Key Positions

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/api/v1/key-positions` | List tất cả (IsDeleted=false) |
| `GET` | `/api/v1/key-positions/{id}` | Single |
| `POST` | `/api/v1/key-positions` | Tạo mới, trả 201 |
| `PUT` | `/api/v1/key-positions/{id}` | Cập nhật |
| `DELETE` | `/api/v1/key-positions/{id}` | Soft delete |

`riskLevel` computed tự động:
```
successorCount == 0            → "High"
readyNowCount  == 0            → "High"
readyNowCount   < 2            → "Medium"
else                           → "Low"
```

### Succession Plans

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/api/v1/succession/plans` | List tất cả plans |
| `GET` | `/api/v1/succession/plans/{id}` | Single plan |
| `GET` | `/api/v1/succession/employee/{id}` | Plans chứa talentId |
| `GET` | `/api/v1/succession/nine-box` | EmployeeExtension scores cho 9-Box grid |
| `POST` | `/api/v1/succession/plans` | Tạo hoặc upsert by positionId |
| `PUT` | `/api/v1/succession/plans/{id}` | Cập nhật successors list |

### Dashboard

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/api/v1/dashboard/kpi` | Aggregated KPI, cache 2 phút |

Response:
```json
{
  "totalTalents": 25,
  "tierCounts": { "Nòng cốt": 8, "Tiềm năng": 10, "Kế thừa": 5, "Chưa phân bổ": 2 },
  "positionsWithSuccessors": 9,
  "positionsNoSuccessor": 3,
  "highRiskTalents": 4,
  "activeIdps": 12,
  "avgIdpProgress": 67,
  "topRisk": [{ "id": "x", "riskScore": 80, "riskReasons": ["..."] }]
}
```

---

## 7. Program.cs — Cấu hình

```csharp
// CORS: localhost:4200 + vercel.app
// DB: SQLite tại ContentRootPath/succession.db
// EnsureCreated() khi startup — tự tạo schema
// VnrHreClient: timeout 30s, SSL bypass
// JSON: camelCase + ignore null
// Cache: IMemoryCache (built-in)
```

**Không cần migration riêng** — `EnsureCreated()` tạo schema tự động lần đầu chạy.

---

## 8. Frontend Changes (áp dụng khi build backend)

### Files đã sửa

| File | Thay đổi |
|---|---|
| `core/models/models.ts` | Thêm `DashboardKpi` interface |
| `modules/dashboard/dashboard.component.ts` | Phân nhánh `useMock=false` → gọi `dashboard/kpi` |
| `modules/admin/admin.component.ts` | Fix path `'succession-plans'` → `'succession/plans'` |

### Mapping TalentTier đã xử lý trong backend

| Backend lưu | Frontend nhận | Xử lý tại |
|---|---|---|
| `"Core"` | `"Nòng cốt"` | `EmployeesController.MapTier()` |
| `"Potential"` | `"Tiềm năng"` | `EmployeesController.MapTier()` |
| `"Successor"` | `"Kế thừa"` | `EmployeesController.MapTier()` |
| `"1-2 Years"` | `"Ready in 1 Year"` | `EmployeesController.MapReadiness()` |
| `"3+ Years"` | `"Ready in 2 Years"` | `EmployeesController.MapReadiness()` |
| `"Core"` | `"Nòng cốt"` | `DashboardController.MapTier()` |

---

## 9. Integration Status — Toàn bộ endpoints

| Endpoint | Method | Frontend Connected | File |
|---|---|---|---|
| `/api/v1/employees` | GET | ✅ | dashboard, talent-list, succession, talent-profile (×2) |
| `/api/v1/employees/{id}` | GET | ✅ | talent-profile |
| `/api/v1/employees/sync` | POST | ⬜ chưa có UI | admin.component (cần thêm nút) |
| `/api/v1/employees/{id}/scores` | PATCH | ⬜ chưa có UI | talent-profile / admin (cần form) |
| `/api/v1/departments` | GET | ⬜ | frontend lấy dept từ employee list |
| `/api/v1/key-positions` | GET | ✅ | dashboard, talent-list, positions, succession |
| `/api/v1/key-positions/{id}` | GET | ⬜ | — |
| `/api/v1/key-positions` | POST | ⬜ | positions.component `submit()` (hiện add local) |
| `/api/v1/key-positions/{id}` | PUT | ⬜ | chưa có edit UI |
| `/api/v1/key-positions/{id}` | DELETE | ⬜ | chưa có delete UI |
| `/api/v1/succession/plans` | GET | ✅ | succession, positions, admin |
| `/api/v1/succession/plans/{id}` | GET | ⬜ | — |
| `/api/v1/succession/employee/{id}` | GET | ⬜ | — |
| `/api/v1/succession/nine-box` | GET | ⬜ | nine-box tính từ employees list |
| `/api/v1/succession/plans` | POST | ⬜ | chưa có UI tạo plan |
| `/api/v1/succession/plans/{id}` | PUT | ⬜ | chưa có UI edit |
| `/api/v1/dashboard/kpi` | GET | ✅ | dashboard (khi `useMock=false`) |

**Tổng: 6/17 CONNECTED** — đủ cho các trang chính (dashboard, talent, positions, succession map) hoạt động ngay khi flip `useMock=false`.

---

## 10. Build Status

| Lần build | Backend | Frontend | Ghi chú |
|---|---|---|---|
| Sau Prompt 1 | ✅ 0 err 0 warn | — | EmployeeExtension + SyncService |
| Sau Prompt 2 | ✅ 0 err 0 warn | ✅ 0 err | +Employee GET endpoints |
| Sau Prompt 3 | ✅ 0 err 0 warn | ✅ 0 err | +KeyPositions + Succession |
| Sau Prompt 4 | ✅ 0 err 0 warn | ✅ 0 err | +Dashboard KPI |

---

## 11. Hướng dẫn chạy

### Lần đầu (seed data)

```bash
# 1. Start backend
cd backend
dotnet run
# → http://localhost:5000
# → succession.db tự tạo với schema đầy đủ

# 2. Seed EmployeeExtension từ VnR
curl -X POST http://localhost:5000/api/v1/employees/sync
# → { "message": "Sync completed", "syncedAt": "..." }

# 3. Flip frontend sang real API
# frontend/src/environments/environment.ts
useMock: false
```

### Các lần sau

```bash
dotnet run   # backend tự dùng DB đã có
```

### Sync định kỳ (đề xuất)

- Chạy `POST /api/v1/employees/sync` hàng tuần hoặc sau mỗi kỳ đánh giá VnR
- Có thể schedule bằng Hangfire / cron job gọi endpoint này

---

## 12. Việc còn lại (Backlog)

### Backend endpoints chưa có

| Endpoint | Ưu tiên | Ghi chú |
|---|---|---|
| `GET /api/v1/employees/{id}/review` | High | Talent profile cần — hiện 404 khi useMock=false |
| `GET /api/v1/employees/{id}/current-project` | High | Talent profile cần |
| `GET /api/v1/employees/{id}/knowledge-transfer` | High | Talent profile cần |
| `GET /api/v1/idp` | Medium | Dashboard + IDP module |
| `GET /api/v1/idp/{id}/employee` | Medium | Talent profile IDP tab |
| `GET /api/v1/assessments` | Low | Assessment module (chưa build frontend) |
| `GET /api/v1/mentoring-pairs` | Low | Mentoring module |
| `GET /api/v1/calibration-sessions` | Low | Calibration module |

### Frontend CRUD cần hook vào backend

| Component | Action | API call cần thêm |
|---|---|---|
| `positions.component.ts` | Tạo vị trí | `api.post('key-positions', payload)` thay local add |
| `positions.component.ts` | Xoá vị trí | `api.delete('key-positions/{id}')` |
| `succession.component.ts` | Tạo/sửa plan | `api.post/put('succession/plans', ...)` |
| `admin.component.ts` | Trigger sync | `api.post('employees/sync')` + toast |
| `talent-profile.component.ts` | Override scores | `api.patch('employees/{id}/scores', ...)` |

### JWT Authentication

Backend hiện **chưa có JWT validation** — chỉ có Angular frontend attach Bearer token.
Cần thêm:

```csharp
// Program.cs
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o => { o.Authority = "https://ba.vnresource.net:1516"; ... });
app.UseAuthentication();
```

---

*Tạo bởi Claude Code · 2026-04-22*
