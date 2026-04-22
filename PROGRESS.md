# PROGRESS.md — SuccessionOS Frontend
> File này được Claude Code tự cập nhật sau mỗi task.
> Khi mở session mới: đọc file này TRƯỚC để biết trạng thái hiện tại.
<<<<<<< HEAD
> Cập nhật lần cuối: 2026-04-22 19:00

---

## ⚡ Wire Supabase Data Services → Components (2026-04-22 19:00)

### Kết quả: ✅ Build 0 errors · ng serve chạy tại localhost:4200

| Component | Service được wire | Pattern |
|-----------|------------------|---------|
| `dashboard.component.ts` | `EmployeeService`, `KeyPositionService`, `IdpService` | `Promise.all([...])` |
| `talent-list.component.ts` | `EmployeeService`, `KeyPositionService` | `Promise.all([...])` |
| `talent-profile.component.ts` | `EmployeeService`, `IdpService` | `await getById(id)` + `await getAll(id)` |
| `positions.component.ts` | `KeyPositionService` | `Promise.all + posSvc.create()` |
| `succession.component.ts` | `EmployeeService`, `KeyPositionService` | `Promise.all([...])` |
| `idp.component.ts` | `IdpService` | `await getAll()` + `await create()` |
| `admin.component.ts` | `EmployeeService`, `KeyPositionService`, `IdpService` | Hybrid: Supabase + ApiService mock |

### Files đã sửa
- `frontend/src/app/modules/dashboard/dashboard.component.ts`
- `frontend/src/app/modules/talent/talent-list.component.ts`
- `frontend/src/app/modules/talent/talent-profile.component.ts`
- `frontend/src/app/modules/positions/positions.component.ts`
- `frontend/src/app/modules/succession/succession.component.ts`
- `frontend/src/app/modules/idp/idp.component.ts`
- `frontend/src/app/modules/admin/admin.component.ts`
- `frontend/src/app/core/services/supabase.service.ts` (thêm constructor + options)

### Bước tiếp theo
- Điền `anonKey` thật của Supabase vào `environment.ts`
- Tạo RLS policies trên Supabase cho các bảng (v_employees, key_positions, succession_plans, idp_plans, idp_goals)
- Test đăng nhập email/password qua Supabase Auth

---

## ⚡ Migration: OIDC → Supabase Auth (2026-04-22)

### Kết quả: ✅ Build 0 errors, Exit 0

| Task | Mô tả | Trạng thái |
|------|-------|-----------|
| Task 1 | `npm install @supabase/supabase-js` | ✅ Done |
| Task 2 | Sửa environment.ts + environment.prod.ts → xóa apiUrl/oidc, thêm supabase config | ✅ Done |
| Task 3 | Tạo `core/services/supabase.service.ts` | ✅ Done |
| Task 4 | Viết lại `core/auth/auth.service.ts` dùng Supabase Auth, signals | ✅ Done |
| Task 5 | Tạo 4 data services: employee, key-position, idp, dashboard | ✅ Done |
| Task 6 | Xóa: oidc.service.ts, oidc-callback/, logout-callback/, jwt.interceptor.ts | ✅ Done |
| Task 7 | Sửa models.ts → toàn bộ snake_case (full_name, performance_score, v.v.) | ✅ Done |
| Task 8 | Sửa app.config.ts → xóa jwtInterceptor, giữ HttpClient | ✅ Done |
| Task 9 | Fix toàn bộ TypeScript errors → 0 errors, build exit 0 | ✅ Done |
=======
> Cập nhật lần cuối: 2026-04-22 (snake_case refactor pass)
>>>>>>> claude/sleepy-margulis-3c9b5d

---

## Trạng thái tổng quan

```
Project:  SuccessionOS Angular 18 Frontend
Stack:    Angular 18 + ng-zorro-antd + Supabase
Auth:     Supabase Auth (email/password + Google OAuth + Azure)
DB:       Supabase PostgreSQL (view v_employees, key_positions, succession_plans, idp_plans)
Staging:  https://succession-os-y6mt.vercel.app
```

### Tiến độ tổng thể: ~98% ████████████████████

Project:  SuccessionOS Angular 18 Frontend
Stack:    Angular 18 + ng-zorro-antd + TypeScript
Dev:      localhost:4200
Mock:     public/mock/*.json (useMock: false — kết nối real API)
Backend:  Dev team build .NET 8 API (chưa có)
Staging:  https://succession-os-y6mt.vercel.app
```

### Tiến độ tổng thể: ~97% ███████████████████▓

| Nhóm | Trạng thái | % |
|---|---|---|
| Core / Foundation / Auth | ✅ Hoàn thành | 100% |
| Layout Shell | ✅ Hoàn thành | 100% |
| Dashboard | ✅ Hoàn thành | 100% |
| Talent List + Profile | ✅ Hoàn thành | 100% |
| Key Positions | ✅ Hoàn thành | 100% |
| Succession Map | ✅ Hoàn thành | 100% |
| Admin Panel | ✅ Hoàn thành | 100% |
| SSO / OIDC Integration | ✅ Hoàn thành | 100% |
| IDP Module | ✅ Hoàn thành | 90% |
| Assessment Module | ✅ Hoàn thành | 90% |
| Mentoring Module | ✅ Hoàn thành | 90% |
| Calibration Module | ✅ Hoàn thành | 85% |
| Reports Module | ✅ Hoàn thành | 85% |
| Marketplace Module | ✅ Hoàn thành | 90% |
| Backend Integration | 🟡 Đang tiến hành | 80% |
| RBAC / Permissions | 🔲 Backlog | 0% |

---

## ✅ Đã hoàn thành

### Service Stubs — core/services/data/ (2026-04-22)
- [x] **`core/services/data/employee.service.ts`** — `getAll(filter)`, `getById(id)`, `getNetwork(id)`, `getRiskFactors(id)`, `update(id, payload)`
- [x] **`core/services/data/key-position.service.ts`** — `getAll(filter)`, `getById(id)`, `getSuccessors(positionId)`, `getSummary()`, `create/update/delete`
- [x] **`core/services/data/succession.service.ts`** — `getPlans(filter)`, `getNineBox()`, `upsertPlan(payload)`, `deletePlan(id)`
- [x] **`core/services/data/idp.service.ts`** — `getAll(filter)`, `getByEmployee(employeeId)`, `create(payload)`, `addGoal`, `updateGoal`
- [x] **`core/services/data/dashboard.service.ts`** — `getKpi()`, `getRiskAlerts(limit)`, `getDepartments()`
- Tất cả stub inject `SupabaseService` từ `../supabase.service` (chờ CLI tạo); methods trả empty data/null để compile — logic thật sẽ do CLI fill sau
- **Fix import paths**: [dashboard.component.ts](frontend/src/app/modules/dashboard/dashboard.component.ts) + [talent-list.component.ts](frontend/src/app/modules/talent/talent-list.component.ts) chuyển từ `core/services/*.service` → `core/services/data/*.service`
- **Chưa build** — chờ CLI fix 4 lỗi (SupabaseService tạo mới + còn lại) rồi build một lần

### Supabase Auth Callback (2026-04-22)
- [x] **`modules/auth/callback/callback.component.ts`** — Standalone, inject `SupabaseService`, `ngOnInit` gọi `sb.client.auth.getSession()` → `/dashboard` nếu có session, `/login` nếu không; template chỉ `nz-spin` fullscreen centered
- [x] **`app.routes.ts`** — Route `auth/callback` trỏ sang `CallbackComponent` mới; xóa `/logout` (logout-callback) và `/silent-refresh` cũ (OIDC)
- [x] **OIDC cleanup** — Xóa `core/auth/oidc-callback/`, `core/auth/logout-callback/`, `core/auth/oidc.service.ts`. Còn lại trong `core/auth/`: chỉ `auth.service.ts`

### Data Binding Refactor — snake_case + service stubs (2026-04-22)
- [x] **TASK 1 — dashboard.component.ts** — Xóa `ApiService`, inject `DashboardService` (stub từ CLI), `isLoading = signal(false)`, TODO `await dashboardSvc.getKpi()` trong `ngOnInit`
- [x] **TASK 2 — talent-list.component.ts** — Xóa HttpClient calls, inject `EmployeeService`, rename fields `fullName/performanceScore/potentialScore/riskScore/talentTier/readinessLevel` → snake_case (TS + HTML)
- [x] **TASK 3 — talent-profile.component.ts + .html** — Toàn bộ field snake_case (trên Talent) + `talent().mentor` → `talent().mentor_name` (từ v_employees view)
- [x] **TASK 4 — positions.component.ts + .html** — `currentHolder → current_holder_id`, `successorCount → successor_count`, `readyNowCount → ready_now_count`, `riskLevel → risk_level`, `criticalLevel → critical_level` (NewPositionDraft interface + KeyPosition construction đồng bộ)
- [x] **TASK 5 — succession.component.ts + .html** — Snake_case Talent + TreeNode interface (`current_holder_id`, `critical_level`); `talentsInBox()` giờ dùng `t.box` field từ view `v_nine_box` thay vì compute từ thresholds
- [x] **TASK 6 — idp.component.ts + .html** — `talentName/talentId/overallProgress/targetPosition/approvedBy/approvedDate/goals12m/goals2to3y` → snake_case
- [x] **TASK 7 — admin.component.ts** — Xóa 8 `api.get()` với endpoint strings cũ trong ngOnInit, thay bằng 5 TODO comment per tab (Overview/Data/Users/Settings/Audit)
- **UI giữ nguyên 100%** — Chỉ đổi data binding/field names. KHÔNG đụng `core/` / `services/` (CLI làm song song). Build sẽ chạy sau khi CLI xong.

### Backend API (.NET 8)
- [x] **Prompt 1 — EmployeeExtension + SyncService (2026-04-22)**
  - `backend/` — .NET 8 Web API project tạo mới, SQLite, EF Core 8.0.11
  - `Domain/Entities/EmployeeExtension.cs` — Entity với JSON columns (Competencies, RiskReasons)
  - `Infrastructure/Data/SuccessionDbContext.cs` — DbContext + OnModelCreating JSON config
  - `Infrastructure/VnrHre/VnrHreClient.cs` — HttpClient SSL bypass, 7 methods (3 sync + 4 employee)
  - `Application/Services/EmployeeSyncService.cs` — Công thức nội suy performance/potential/risk từ VnR data
  - `API/Controllers/EmployeesController.cs` — `POST /sync` + `PATCH /{id}/scores`
  - `Program.cs` — CORS, DI, EnsureCreated, camelCase JSON
  - Build: ✅ 0 lỗi 0 warning

- [x] **Prompt 2 — Employee List + Detail (2026-04-22)**
  - `GET /api/v1/employees` — merge VnR profiles + EmployeeExtension, filter ?department= ?tier=
  - `GET /api/v1/employees/{id}` — single employee với scores
  - `GET /api/v1/departments` — lookup từ VnR cache (10 phút)
  - `DepartmentsController.cs` — tạo mới
  - Mapping: `"Core"→"Nòng cốt"`, `"1-2 Years"→"Ready in 1 Year"`, v.v. — đúng format frontend
  - **5/5 frontend call đã CONNECTED** (dashboard, talent-list, succession, talent-profile ×2)
  - Build: ✅ 0 lỗi 0 warning

- [x] **Prompt 3 — Key Positions + Succession Plans (2026-04-22)**
  - `Domain/Entities/KeyPosition.cs` + `SuccessionPlan.cs` — entities với JSON columns
  - `DbContext` cập nhật: 3 DbSets + JSON converters cho List<string> + OwnsMany SuccessorEntry
  - `KeyPositionsController.cs` — full CRUD: GET list, GET by id, POST, PUT, DELETE (soft)
    - `riskLevel` computed: successorCount==0 → High, readyNowCount==0 → High, <2 → Medium, else Low
  - `SuccessionController.cs` — GET plans, GET by id, GET by employee, GET nine-box, POST upsert, PUT
  - `admin.component.ts` — **fixed** path `'succession-plans'` → `'succession/plans'`
  - **4/4 GET key-positions CONNECTED** · **3/3 GET succession/plans CONNECTED**
  - Angular build: ✅ 0 TypeScript error

- [x] **AI Talent Insight — OpenAI GPT-4o-mini Integration (2026-04-22)**
  - `Application/Services/AiInsightService.cs` — service mới + `TalentInsightRequest` record
    - Gọi OpenAI `/v1/chat/completions` qua `IHttpClientFactory` named "openai"
    - Model: `gpt-4o-mini`, max_tokens: 600, temperature: 0.7
    - System prompt: chuyên gia HR cao cấp PTSC M&C
    - Prompt builder xử lý graceful null cho tất cả nullable scores/competencies
    - Trả markdown 4 section: Đánh giá tổng quan / Điểm mạnh / Cần phát triển / Khuyến nghị
    - Lỗi OpenAI → trả empty string (không crash)
  - `Program.cs` — đăng ký `AddHttpClient("openai")` base https://api.openai.com + `AddScoped<AiInsightService>()`
  - `TalentProfileController.cs` — `GET /api/v1/talent-profile/{id}/ai-insight`
    - Inject `VnrHreClient`, `IMemoryCache`, `AiInsightService`
    - Fetch employee data từ VnR + EmployeeExtension, build TalentInsightRequest
    - Return `{ insight: "...markdown..." }` hoặc 204 nếu ApiKey chưa cấu hình
  - `appsettings.Development.json` — thêm `OpenAI.ApiKey`
  - `models.ts` — thêm `AiInsight { insight: string }` interface
  - `talent-profile.component.ts` — `aiInsight`, `aiLoading` signals; `loadAiInsight()` method; `markdownToHtml()` converter
  - `talent-profile.component.html` — AI card với gradient purple/indigo, robot icon, nz-spin, innerHTML rendering
  - `talent-profile.component.scss` — `.ai-card` styles (gradient, border, heading, list, empty state)
  - Build backend: ✅ 0 lỗi 0 warning · Build frontend: ✅ 0 TypeScript error, prerender 18 routes OK

- [x] **VnR SCC API Integration (2026-04-22)** ✅
  - `Infrastructure/VnrHre/VnrSccClient.cs` — NEW: Client cho VnR SCC API (port 7063)
    - DTOs: `SccNineBoxItem`, `SccTalentTagItem`, `SccCandidateItem` với `[JsonPropertyName]`
    - Endpoints: `NineBoxProfile/list`, `TalentProfile/list`, `SCC_Candidate/list`
    - Static mappers: `MapTier()` (VN → Core/Potential/Successor), `MapReadiness()`, `MapAxisScore()`
    - Cached lookups: `GetNineBoxLookupAsync`, `GetTalentTagLookupAsync` (5 phút)
  - `appsettings.Development.json` — thêm `VnrScc:BaseUrl = https://172.21.30.87:7063`
  - `Program.cs` — đăng ký `AddHttpClient<VnrSccClient>()` với VnrAuthHandler + SSL bypass
  - `EmployeeSyncService.cs` — tích hợp SCC data:
    - PerformanceScore: SCC NineBox axis → HRE ContractEvaResult (fallback)
    - PotentialScore: SCC NineBox axis → HRE Promotion formula (fallback)
    - TalentTier: SCC TalentTagName (ưu tiên) → computed from scores (fallback)
    - ReadinessLevel: SCC TalentTag → SCC Candidate "best" → computed (fallback)
    - SyncResult mở rộng: `SccNineBoxAvailable`, `SccTalentTagAvailable`, `SccCandidateAvailable`
  - `EmployeesController.cs` — sync response thêm `sccNineBox`, `sccTalentTag`, `sccCandidate` status
  - `admin.component.ts` — `syncEndpoints` + `syncProfilesN` signals; `endpointEntries()` helper
  - `admin.component.html` — hiển thị endpoint status chips sau khi sync (xanh ✅ / vàng ⏳)
  - `admin.component.scss` — `.sync-endpoints`, `.sync-ep.ep-ok/.ep-wait` styles
  - Build backend: ✅ 0 errors · Build frontend: ✅ 0 errors, 18 routes OK

- [x] **VnR field name fix + Admin endpoint fix (2026-04-23)** ✅
  - Root cause: `VnrLookup(Id, Name)` không map được `orgId/orgName` và `titleId/titleName` → Phòng ban/Chức danh luôn "—"
  - `VnrHreClient.cs` — tạo `VnrOrgItem(orgId, orgName)` + `VnrJobTitleItem(titleId, titleName)` với `[JsonPropertyName]`; tách `GetOrgLookupAsync`/`GetJobTitleLookupAsync` thành inline cache với logging; thêm `PropertyNameCaseInsensitive = true` cho tất cả ReadFromJsonAsync; `PostListAsync` bọc try-catch
  - `admin.component.ts` — sửa 3 endpoint sai: `'talents'→'employees'`, `'positions'→'key-positions'`, `'idp-plans'→'idp'`
  - Build: ✅ 0 lỗi 0 warning

- [x] **Logout fix + Fake token cleanup (2026-04-23)** ✅
  - `auth.service.ts` — `logout()` dùng `localStorage.clear()` thay vì xóa từng key (không còn sót token); `hasToken()` tự clear `fake-jwt-*` tokens
  - `shell.component.ts` — `logoutSSO()` đọc `id_token` TRƯỚC khi xóa (fix race condition)
  - Root cause: token cũ (`fake-jwt-*` hoặc expired SSO JWT) còn trong localStorage → app skip login page
  - Build: ✅ 0 lỗi

- [x] **Login SSO-first + Auto-clear fake tokens (2026-04-23)**
  - `auth.service.ts` — `hasToken()` tự clear `fake-jwt-*` tokens và return false → buộc re-login qua SSO thật
  - `login.component.ts` — `ngOnInit` auto-start `startSsoRedirect()` → redirect ngay sang VnR SSO; `redirecting` signal điều khiển spinner vs form; fallback hiện form nếu SSO unreachable
  - `login.component.html` — khi `redirecting()=true` hiện spinner "Đang chuyển đến trang đăng nhập HRM Pro..."; khi `false` (SSO fail) hiện SSO button làm primary + dev fallback ẩn trong `<details>`
  - `login.component.scss` — style `.sso-redirecting`, `.btn-sso-primary`, `.dev-fallback` + `.dev-fallback-toggle`
  - `environment.ts` — `clientSecret: 'secret'` đã đúng; SSO config hoàn chỉnh: issuer `ba.vnresource.net:1516`, clientId `hrm_scc_dev`
  - Build frontend: ✅ 0 lỗi, prerender 18 routes OK

- [x] **VnR SSO Token Pass-through (2026-04-23)**
  - `Infrastructure/VnrHre/VnrAuthHandler.cs` — `DelegatingHandler` mới: extract Bearer JWT từ incoming request → attach vào outgoing VnR request; fallback về `VnrHre:BearerToken` trong appsettings khi không có HTTP context
  - `Program.cs` — đăng ký `AddHttpContextAccessor()`, `AddTransient<VnrAuthHandler>()`, wire `.AddHttpMessageHandler<VnrAuthHandler>()` vào VnrHreClient
  - Kết quả: Angular SSO login → JWT token được tự động forward đến VnR API → giải quyết toàn bộ 500 lỗi OIDC
  - Build: ✅ 0 lỗi 0 warning

- [x] **VnR Resilience + Offline Fallback + IdpController (2026-04-22)**
  - `VnrHreClient.cs` — `GetAsync<T>` bọc try-catch trả empty list khi VnR 5xx; `GetLookupCachedAsync` catch ALL exceptions (trước chỉ 401/403); `GetProfilesCachedAsync` cache 5 phút; `GetProfileByIdAsync` thêm `IMemoryCache` param, fallback về cached full list nếu individual endpoint chưa mở
  - `EmployeesController.cs` — `GetAll` fallback dùng DB snapshot khi VnR down (`MapFromExtension`); `GetById` pass cache
  - `DashboardController.cs` — wrap VnR call trong try-catch để dashboard không crash khi VnR down
  - `IdpController.cs` — tạo mới: `GET /api/v1/idp`, `GET /api/v1/idp/{id}`, `POST /api/v1/idp`, `PUT /api/v1/idp/{id}`
  - `Domain/Entities/EmployeeExtension.cs` — thêm 5 profile snapshot fields: `FullName`, `Email`, `OrgStructureId`, `JobTitleId`, `HireDate`
  - `Program.cs` — idempotent SQLite `ALTER TABLE ADD COLUMN` khi khởi động (migrate schema không cần EF migration)
  - `EmployeeSyncService.cs` — lưu profile snapshot vào EmployeeExtension khi sync; `SafeFetchAsync` catch ALL exceptions (không chỉ 401/403); union all profileIds đảm bảo snapshot cho toàn bộ employees
  - Build: ✅ 0 lỗi 0 warning

- [x] **Null Score Type Fix — models.ts + 6 components (2026-04-22)**
  - `models.ts` — `performanceScore`, `potentialScore`, `riskScore` đổi từ `number` → `number | null` (đúng với API thực)
  - `talent-profile.component.ts` — `overallScore` trả `number | null`; tất cả comparisons + computations thêm `?? 0`
  - `talent-list.component.ts` — `departureReasons()` null guards
  - `dashboard.component.ts` — `highRiskTalents`, `riskReason()`, `riskPill()` null guards
  - `reports.component.ts` — `avgRisk`, `avgPerf` null guards
  - `succession.component.ts` — `talentsInBox`, `starCount`, `previewPerf/Pot` null guards
  - `talent-profile.component.html` — display `—` thay vì `null` cho Hiệu suất/Tiềm năng/Overall/Rủi ro
  - TypeScript: ✅ 0 lỗi · Angular build: ✅ 0 errors 0 warnings, prerender 18 routes OK

- [x] **Fix 404 — 5 Talent Profile Endpoints (2026-04-22)**
  - 5 entities mới: `CareerReview`, `CurrentProject`, `KnowledgeTransfer`, `Assessment360`, `IdpPlanDetail`
  - `SuccessionDbContext.cs` — 5 DbSets mới + JSON config
  - `TalentProfileController.cs` — 5 GET endpoints + 1 PUT (upsert career review)
  - `talent-profile.component.ts` — 5 `*Loaded = signal<boolean | null>(null)` cho graceful 404/error state
  - Build backend: ✅ 0 lỗi · Build frontend: ✅ 0 lỗi, prerender 18 routes OK


  - `Domain/Entities/IdpPlan.cs` — entity mới (Id, TalentId, TalentName, Year, Status, OverallProgress)
  - `DbContext` cập nhật: thêm DbSet<IdpPlan>
  - `DashboardController.cs` — `GET /api/v1/dashboard/kpi`, cache 2 phút, 3 queries parallel
    - Trả: totalTalents, tierCounts (Vietnamese), positionsWithSuccessors, highRiskTalents, activeIdps, avgIdpProgress, topRisk
  - `models.ts` — thêm `DashboardKpi` interface
  - `dashboard.component.ts` — phân nhánh: `useMock=false` → gọi `dashboard/kpi`, `useMock=true` → 3 calls mock
  - Build backend: ✅ 0 lỗi 0 warning · Build frontend: ✅ 0 TypeScript error

### Bug Fixes
- [x] **SSR Hydration Fix (2026-04-22)** — Fix triệt để `TypeError: Cannot read properties of null (reading 'hasAttribute')`:
  - Tạo `core/utils/browser.utils.ts` với `isBrowser`, `safeLocalStorage`, `safeSessionStorage`, `safeNavigateTo`, `safeLocationSearch`
  - Fix **field initializer** nguy hiểm: `isLoggedIn$ = new BehaviorSubject(this.hasToken())` → khởi tạo `false`, set thực trong constructor
  - Thay toàn bộ `localStorage.*` / `sessionStorage.*` / `window.localStorage` thành safe utils trong 8 file
  - 0 lỗi TypeScript, build thành công, prerender 18 static routes OK

### Setup & Foundation
- [x] Angular 18 monorepo tạo tại `successionos/frontend/`
- [x] ng-zorro-antd cài đặt + locale vi_VN
- [x] Font Roboto global trong styles.scss
- [x] CSS design tokens: --color-primary, --color-sidebar, --color-bg, --color-card, --color-border, --color-text
- [x] environments/environment.ts: apiUrl + useMock: true
- [x] environments/environment.prod.ts: apiUrl staging + useMock: false

### Core Layer
- [x] `core/services/api.service.ts` — HttpClient wrapper, đọc mock JSON nếu useMock=true, attach Bearer token
- [x] `core/auth/auth.service.ts` — Login/logout, JWT localStorage, BehaviorSubject isLoggedIn + `setSession()`
- [x] `core/guards/auth.guard.ts` — Redirect /login nếu chưa auth (chuẩn CanActivateFn trả UrlTree)
- [x] `core/interceptors/jwt.interceptor.ts` — Auto attach Authorization header, skip OIDC issuer endpoints
- [x] `core/utils/browser.utils.ts` — SSR-safe utils: `isBrowser`, `safeLocalStorage`, `safeSessionStorage`, `safeNavigateTo`, `safeLocationSearch`

### Layout Shell
- [x] `app.component.html` — nz-layout + nz-sider sidebar
- [x] Sidebar background: #1E1B4B (navy), compact 240px, sticky 100vh
- [x] Logo "SuccessionOS" + tenant "PTSC M&C" từ `/logo.png`
- [x] User info footer: avatar + tên + role + dropdown (logout local / logout SSO)
- [x] Header: bell icon + user name + avatar
- [x] Menu groups: Quản lý nhân tài / Phát triển / Phân tích / Hệ thống
- [x] Sidebar disable 6 module chưa build (IDP, Đánh giá, Kèm cặp, Họp hiệu chỉnh, Báo cáo, Marketplace) — badge "Sắp ra mắt" + tooltip

### Shared Components
- [x] `shared/components/stat-card/` — StatCardComponent
- [x] `shared/components/avatar/` — AvatarComponent
- [x] `shared/components/risk-badge/` — RiskBadgeComponent
- [x] `shared/components/tier-badge/` — TierBadgeComponent
- [x] `shared/components/shell/` — ShellComponent (layout sidebar + header)

### Dashboard
- [x] KPI cards màu nhẹ theo ngữ nghĩa (blue/green/red/amber) + gradient + accent border trái + halo icon
- [x] Donut "Phân bổ tầng nhân sự": SVG 4 tier + "Chưa phân bổ", hover highlight, legend count+%
- [x] "12 Vị trí Then chốt" — cards tone readiness (good/warn/bad: green/amber/red) + pulse dot + hover lift
- [x] High risk table + IDP progress bars

### Talent List
- [x] Prototype UI + filter/sort + bind mock data
- [x] Mini-stats chip pill màu, row clickable + chevron hover
- [x] Overall score badge green gradient, bars Perf/Pot gradient
- [x] Icon key vàng khi talent giữ Key Position + tooltip
- [x] Sub-pill "Kế thừa: [vị trí]" cho tier Kế thừa, +N chip khi >1
- [x] "Rủi ro rời đi" với reason chip khi High risk
- [x] Cột "Khoảng cách năng lực" — avg shortfall, pill 3-tone Đạt/Thiếu N

### Talent Profile (`/talent/:id`)
- [x] Breadcrumb + risk banner (pink) + hero 3-column + pills tier/ready/IDP
- [x] Mentor row: nút `+` → modal picker (search tên/vị trí/phòng ban), nút `×` bỏ gán
- [x] Radar "Hồ sơ năng lực": SVG pentagon 5 trục, thực tế vs mục tiêu, badge vượt/cần cải thiện
- [x] Network "Mạng lưới phát triển": hub-spoke SVG, click mentor/mentee → switch center
- [x] "Yếu tố rủi ro" card collapsible: alert strip avg dept, factors dot màu severity + tags
- [x] "Kết quả đánh giá 360°" card collapsible: radar + bảng 13 tiêu chí + Điểm mạnh/Cần phát triển + manager quote
- [x] Review grid 2-col: đánh giá năng lực + dự án hiện tại + thống kê nhanh + IDP card
- [x] "Chuyển giao Tri thức" card: successor + progress bar + knowledge items
- [x] Tabs: Đánh giá 360° / Kế hoạch IDP / Lịch sử (bỏ tab Năng lực trùng)
- [x] Talent preview drawer: `calc(100vw - 240px)`, URL sync `/talent/:id` qua `Location.go()`, layer stack không đóng position drawer, full profile embedded

### Key Positions (`/positions`)
- [x] Hero header gradient indigo + stats strip 4 chip màu
- [x] Position cards tone theo criticalLevel (red/amber/blue/green) + accent bar + halo + gradient
- [x] Add Position: nz-drawer 640px từ phải, drag-drop competencies (CDK + click fallback), form validation, auto-add local
- [x] Position details drawer 520px: người đương nhiệm stats + ứng viên kế thừa list + link /talent/:id
- [x] Successor card fixed width 210px

### Succession Map (`/succession`)
- [x] Hero header gradient + stats (Ngôi sao / Tổng / Cần xử lý)
- [x] 9-Box 6-tone color system + gradient + halo + axis labels modern
- [x] "Điều chỉnh thang đo" drawer 640px: nzSlider range Perf/Pot, preview count 3 mức, badge khi khác default
- [x] Role-based view: Admin/HR "Toàn bộ tổ chức" vs Line Manager "Team của bạn · Department"
- [x] Collapse/expand: ≤3 successors full, ≥4 show 3 + card "Xem thêm +N"
- [x] Unified org tree: `KeyPosition.parentId`, 4 C-level nodes (Chủ tịch → TGĐ → CFO/CHRO), recursive ng-template
- [x] Compact view: rows chevron rotate, mọi node collapse mặc định, click expand panel successors pipeline + tree-children
- [x] Position info drawer: người đương nhiệm + successors list với readiness/gap + link talent

### Admin Panel (`/admin`)
- [x] Hero gradient navy→indigo + 4 stats (users/talents/positions/events)
- [x] Tabs pill-style 5 tab: Tổng quan / Dữ liệu / Người dùng / Cấu hình / Audit
- [x] Dữ liệu: sidebar 8 entities + data grid search + Add/Edit/Delete popconfirm + generic edit modal
- [x] Người dùng: table CRUD + role tags
- [x] Cấu hình: module toggles grid (core/pro/enterprise) + drawer 30% config per module
- [x] Audit Trail: table logs + action tags màu

### Login
- [x] Credential check 4 mock accounts + error banner + demo-fill chips click
- [x] Compact layout fit 100vh
- [x] nz-divider "hoặc" + btn "Đăng nhập qua HRM VnResource" → loginWithVnR()

### SSO / OIDC Integration
- [x] `core/auth/oidc.service.ts` — PKCE (verifier/challenge/state), buildAuthorizeUrl(), exchangeCode(), refreshToken(), getUserInfo(), buildLogoutUrl()
- [x] `core/auth/auth.service.ts` — setOidcSession(), scheduleSilentRefresh(), doSilentRefresh(), logout(redirectToSso?)
- [x] `core/auth/oidc-callback/` — validate code+state, CSRF check, exchange → token → userInfo → redirect
- [x] `core/auth/logout-callback/` — clear session + "Đăng xuất thành công" → /login sau 2s
- [x] `public/silent-refresh.html` — postMessage về parent window
- [x] Routes: `/auth/callback`, `/logout`, `/silent-refresh` (không có authGuard)
- [x] Shell dropdown: "Đăng xuất khỏi tất cả thiết bị" → logoutSSO() màu tím
- [x] jwt.interceptor.ts — skip Bearer header cho OIDC issuer endpoints (tránh 401)
- [x] FIX NG0100: wrap ngOnInit trong Promise.resolve().then() + ChangeDetectorRef
- [x] environments: issuer `ba.vnresource.net:1516`, clientId `hrm_scc_dev/prod`, client_secret, scope, URLs Vercel
- [x] `.gitignore` — untrack environment files, tạo `.example` placeholders
- [x] **Test Suite**: OidcService 16/16 ✅ / AuthService 14/14 ✅ / OidcCallback 5/5 ✅ / `SSO_TEST_REPORT.md` ✅
- [x] **Chờ VnR whitelist** — 4 URLs cần đăng ký (dev + prod callback + logout)
- [x] **Cleanup** — Xóa toàn bộ console.log debug khỏi oidc.service.ts / oidc-callback / login.component (SSO đã chạy ổn định)

### API Documentation & Integration Map
- [x] **`API_INTEGRATION_MAP.csv`** — 61 dòng, mỗi API trong hợp đồng được phân loại: KHONG_CAN / DUNG_MOCK / HARDCODE / CHUA_BUILD, kèm file component, hàm cần sửa, mock file, params, fields response, priority P0–P3
- [x] **`API_FIELD_SPEC.csv`** — ~200 dòng per-field breakdown: 23 API endpoint, từng field JSON với kiểu dữ liệu, bắt buộc/tuỳ chọn, giá trị mẫu, range cho phép, mô tả công dụng, vị trí UI, component file, hàm sử dụng, logic xử lý
- [x] **Phân tích endpoint mismatch** — Ghi nhận 5 chuỗi cần đổi khi backend lên (talents→employees, positions→key-positions, idp-plans→idp, mentoring-pairs→mentoring/pairs, succession-plans→succession/plans)
- [x] **Phân tích fetch pattern** — talent-profile cần refactor từ full-list-then-filter sang GET /employees/{id}, /assessments/{id}/latest, /idp/{id}/employee

### VnR HRE Swagger Analysis (2026-04-22)
- [x] **Phân tích Swagger VnR HRE** — 291 endpoints, 49 tag groups tại `172.21.30.87:7067` (self-signed SSL, dùng Chrome MCP)
- [x] **Xác định endpoints liên quan** — 6 tag groups cần thiết: `[HR][Profile]` (11 eps), `Cat_OrgStructure` (9), `Cat_JobTitle` (8), `HR_ContractEvaResult` (1), `Hre_Promotion` (7), `HR_Contract` (8)
- [x] **Xác định endpoints bỏ qua** — EmergencyContact, FamilyMember, Health, IdDocument, MemberShip, HreFile, ContractAnnex, TerminationContract, Address, Religion, Ethnic — KHÔNG fetch
- [x] **Strategy tích hợp** — EmployeeExtension table rỗng khởi đầu, SyncService populate từ 3 VnR endpoints, HR override với `isManualOverride` flag

### BACKEND_PROMPTS.md — Lean VnR Integration (2026-04-22)
- [x] **Rewrite hoàn toàn `BACKEND_PROMPTS.md`** (26KB) — 4 Cursor prompts theo nguyên tắc "chỉ lấy đúng cần thiết"
- [x] **Prompt 1 — EmployeeExtension + SyncService**: entity với nullable scores, công thức nội suy performanceScore/potentialScore/riskScore/talentTier, chỉ 3 VnR endpoints (ContractEvaResult, Hre_Promotion, HR_Contract), `isManualOverride` bảo vệ HR override
- [x] **Prompt 2 — Employee List + Detail**: 4 VnR endpoints, cache org/jobTitle 10 phút (IMemoryCache), merge với SuccessionOS DB, nullable scores khi chưa sync
- [x] **Prompt 3 — Key Positions + Succession Plans**: pure SuccessionOS DB, không call VnR
- [x] **Prompt 4 — Dashboard KPI**: pure SuccessionOS DB aggregation, VnR chỉ là fallback count tổng nhân viên

### Frontend Endpoint Strings — Fixed (2026-04-22)
- [x] **`dashboard.component.ts`**: `'talents'→'employees'`, `'idp-plans'→'idp'`, `'positions'→'key-positions'`
- [x] **`talent-list.component.ts`**: `'talents'→'employees'`, `'positions'→'key-positions'`
- [x] **`talent-profile.component.ts`**: `'talents'→'employees'`, `'idp-plans'→'idp'` (×2)
- [x] **`positions.component.ts`**: `'positions'→'key-positions'`, `'succession-plans'→'succession/plans'`
- [x] **`succession.component.ts`**: `'talents'→'employees'`, `'succession-plans'→'succession/plans'`, `'positions'→'key-positions'`

### Frontend Complete Pass (2026-04-22)
- [x] **Sidebar** — Enable tất cả 6 module đã bị disable: IDP, Assessment, Mentoring, Calibration, Reports, Marketplace
- [x] **Assessment Module** — Wire form "Nhập điểm": selectedTalentId + draftScores signals, live preview bar, overall preview, saveAssessment() với validation + local update + TODO api.post
- [x] **Calibration Module** — "Tạo phiên họp" modal (title/facilitator/date); "Lock phiên" → nz-popconfirm → lockSession(); "Xuất kết quả" → exportSession() toast; NzSpin loading
- [x] **Marketplace Module** — toggleModule(): Thêm/Tắt buttons cập nhật status signal + toast
- [x] **Admin — Sync VnR** — Card "Đồng bộ dữ liệu VnResource HRE" trong Overview tab: syncVnR() gọi POST /employees/sync, loading spinner, lastSyncAt timestamp
- [x] **Positions — api.post** — submit() gọi api.post('key-positions', newPos) sau optimistic local update, graceful degrade khi mock
- [x] **Dashboard (CLI)** — Branch useMock=false → GET /dashboard/kpi; useMock=true → 3 mock calls
- [x] **Talent Profile (CLI)** — section loaded state signals (assessment360Loaded, careerReviewLoaded, etc.) cho UX graceful loading
- [x] **TypeScript** ✅ 0 lỗi · **Git** → commit `07fdc9a` pushed to `khiemlethien-glitch/SuccessionOS`

### P1 Features — IDP + Mentoring + Reports (2026-04-22)
- [x] **IDP Module** (`/idp`) — Create/Edit drawer (560px right) với dynamic goals list; 3-level approval modal (Quản lý trực tiếp → Phòng Nhân sự → Ban Giám đốc) với nz-steps; approve/reject flow cập nhật status IDP → Active; loading spinner; filter buttons; edit/duyệt buttons per card
- [x] **Mentoring Module** (`/mentoring`) — Create pair drawer (500px): mentor/mentee name, focus, start/end dates, sessions count; Logbook drawer (540px): session history per pair (mock 8 sessions M004 đầy đủ), add session form inline với date + summary + next action; session badge count hiển thị trên button; nz-spin khi loading
- [x] **Reports Module** (`/reports`) — IDP Progress tab: 5 KPI cards (total/active/completed/pending/avg%), status distribution bars, full plans table với progress column; Assessment tab: 4 competency avg bars, Top-5 performers với avatar, detailed score table; Tổng quan tab đã có từ trước + giữ nguyên
- [x] **TypeScript compile** ✅ 0 lỗi — tất cả 3 component files
- [x] **Git commit + push** → `khiemlethien-glitch/SuccessionOS` (commit `35ff7d3`)

### Excel Documentation — v3 (2026-04-22)
- [x] **`SuccessionOS_API_Docs.xlsx`** — 3 sheets: Hướng dẫn + API List (31 in-scope / 30 skip, màu sắc) + Field Spec (4 modules: Dashboard, Nhân tài, Vị trí then chốt, Bản đồ kế thừa)
- [x] Color coding: VnR HRE ✅ xanh lá / SuccessionOS DB 🔨 đỏ / in-scope trắng / skip xám
- [x] Merged từ 2 file riêng (CSV + Excel) thành 1 file duy nhất gửi backend dev

### Routing & Config
- [x] Lazy loaded: `/dashboard`, `/talent`, `/succession`, `/positions`, `/idp`, `/assessment`, `/admin`
- [x] All routes protected by authGuard (trừ /login, /auth/callback, /logout, /silent-refresh)
- [x] Placeholder routes: `/profile`, `/settings`
- [x] `app.config.ts` — provideNzIcons 36 icons đầy đủ
- [x] `vercel.json` — buildCommand, output `dist/frontend/browser`, SPA rewrites

### Mock Data
- [x] `public/mock/talents.json` — 25 nhân viên
- [x] `public/mock/positions.json` — 12 vị trí then chốt (+ 4 C-level nodes cho org tree)
- [x] `public/mock/succession-plans.json`
- [x] `public/mock/idp-plans.json`
- [x] + 5 mock files khác

---

## 🔲 Chưa làm

### Modules (sidebar đang disabled — "Sắp ra mắt")

- [x] ~~**IDP Module**~~ ✅ — list + filter + create/edit drawer + 3-level approval modal
- [x] ~~**Assessment Module**~~ ✅ — Tổng quan table + Nhập điểm form wired + Lịch sử list
- [x] ~~**Mentoring Module**~~ ✅ — pairs grid + create pair drawer + logbook + add session
- [x] ~~**Calibration Module**~~ ✅ — sessions list + create modal + lock popconfirm + export
- [x] ~~**Reports Module**~~ ✅ — Tổng quan + IDP Progress + Assessment tabs
- [x] ~~**Marketplace Module**~~ ✅ — module cards + filter + Thêm/Tắt toggle wired
- [ ] **Marketplace Module** (`/marketplace`) — module cards + filter tabs + pricing

### RBAC (sau khi UI xong)
- [ ] Role model: admin / moderator / user
- [ ] `PermissionDirective`: `*hasPermission="'employee.viewSalary'"`
- [ ] Sidebar ẩn/hiện theo role
- [ ] Table columns ẩn/hiện theo role (salary: số thực vs gap% vs ẩn)

### Backend Integration
- [ ] Wire real API khi .NET 8 backend sẵn sàng (useMock: false)
- [x] ~~**P0**: Đổi endpoint strings~~ ✅ **DONE** — đã sửa 5 component files (dashboard, talent-list, talent-profile, positions, succession)
- [x] ~~**P1**: Refactor talent-profile~~ ✅ **DONE** — fetch by ID, 8 endpoints riêng, signal() pattern, mock files
- [x] ~~**environment.ts port**~~ ✅ — đổi apiUrl `5000 → 5157` (port .NET dev server thực tế)
- [x] ~~**VnrHreClient token pass-through**~~ ✅ — `IHttpContextAccessor` forward user OIDC JWT từ Angular → VnR API; fallback `VnrHre:BearerToken` config; build 0 lỗi
- [x] ~~**Program.cs AddHttpContextAccessor**~~ ✅ — registered, bỏ static DefaultRequestHeaders.Authorization
- [x] ~~**VnR Sync**~~ ✅ — Tất cả 5 VnR endpoints đã mở bypass (Cat_OrgStructure, Cat_JobTitle, HR_ContractEvaResult, Hre_Promotion, HR_Contract). Restart backend + POST /employees/sync để populate 944 profiles với real scores + snapshot.
- [ ] **P0**: Kết nối `GET /api/v1/me` thay vì đọc localStorage trong getCurrentUser()
- [ ] Test import HRM360 CSV end-to-end với dữ liệu thật PTSC M&C
- [ ] Verify field visibility RLS policies trên Supabase / .NET

---

## 🐛 Bugs đã fix

| Bug | File | Trạng thái |
|---|---|---|
| SSR deep-link 404 | `server.ts` | ✅ Fixed |
| `localStorage is not defined` trên server (AuthService) | `auth.service.ts` | ✅ Fixed |
| `localStorage is not defined` trên server (ShellComponent) | `shell.component.ts` | ✅ Fixed |
| `ng serve` port conflict | env/process | ✅ Fixed |
| NG0100 ExpressionChangedAfterItHasBeenChecked (OIDC callback) | `oidc-callback.component.ts` | ✅ Fixed |
| 401 từ /connect/token khi interceptor attach Bearer | `jwt.interceptor.ts` | ✅ Fixed |

---

## File structure hiện tại

```
frontend/src/
├── app/
│   ├── app.ts                        ✅ Root component
│   ├── app.config.ts                 ✅ Providers + 36 Icons
│   ├── app.routes.ts                 ✅ Lazy routing + auth/callback + /logout
│   ├── core/
│   │   ├── services/api.service.ts   ✅
│   │   ├── auth/
│   │   │   ├── auth.service.ts       ✅ JWT + OIDC session + silent refresh
│   │   │   ├── oidc.service.ts       ✅ PKCE + token exchange
│   │   │   ├── oidc-callback/        ✅
│   │   │   └── logout-callback/      ✅
│   │   ├── guards/auth.guard.ts      ✅
│   │   ├── interceptors/jwt.interceptor.ts ✅ (skip OIDC endpoints)
│   │   └── models/models.ts          ✅
│   ├── shared/components/
│   │   ├── shell/                    ✅ Sidebar + header + SSO logout
│   │   ├── stat-card/                ✅
│   │   ├── avatar/                   ✅
│   │   ├── risk-badge/               ✅
│   │   └── tier-badge/               ✅
│   └── modules/
│       ├── auth/login/               ✅ Credential check + SSO button
│       ├── dashboard/                ✅ KPI + donut + positions + IDP bars
│       ├── talent/
│       │   ├── talent-list/          ✅ Filter + enrichment + key position icon
│       │   └── talent-profile/       ✅ Full profile (radar, network, 360°, IDP, KT)
│       ├── positions/                ✅ Cards + add drawer + details drawer + preview
│       ├── succession/               ✅ 9-Box + org tree + compact view + drawers
│       ├── admin/                    ✅ 5-tab CRUD + module config drawer + audit
│       ├── idp/                      ✅ list + create/edit drawer + 3-level approval modal
│       ├── assessment/               ✅ Tổng quan + Nhập điểm wired + Lịch sử
│       ├── mentoring/                ✅ pairs grid + create drawer + logbook drawer
│       ├── calibration/              ✅ sessions + create modal + lock + export
│       ├── reports/                  ✅ 4 tabs: Tổng quan + IDP Progress + Assessment + ROI
│       └── marketplace/              ✅ module cards + filter + toggle Thêm/Tắt
├── environments/
│   ├── environment.ts                ✅ (gitignored — secret)
│   ├── environment.ts.example        ✅
│   ├── environment.prod.ts           ✅ (gitignored — secret)
│   └── environment.prod.ts.example   ✅
└── public/
    ├── mock/*.json                   ✅ 9+ mock files
    ├── logo.png                      ✅
    └── silent-refresh.html           ✅
```

---

## Design tokens

```scss
--color-primary:   #1E1B4B  // navy sidebar
--color-accent:    #4F46E5  // indigo buttons/links
--color-bg:        #F9FAFB  // page background
--color-card:      #FFFFFF  // card background
--color-border:    #E5E7EB  // border
--color-text:      #111827  // primary text
--color-text-2:    #6B7280  // secondary text

// Tier badges
--tier-core:       bg #EEF2FF / text #4F46E5
--tier-potential:  bg #FFF7ED / text #C2410C
--tier-successor:  bg #F0FDF4 / text #15803D

// Risk badges
--risk-high:       bg #FEE2E2 / text #991B1B
--risk-medium:     bg #FEF3C7 / text #92400E
--risk-low:        bg #DCFCE7 / text #166534
```

---

## URLs quan trọng

- Staging: https://succession-os-y6mt.vercel.app
- GitHub: https://github.com/khiemlethien-glitch/SuccessionOS
- CLAUDE.md Notion: https://www.notion.so/34819261e1f18157a277dd5116103f22
- OIDC Issuer: https://ba.vnresource.net:1516

## Cách mở session mới trong Claude Code

```
Đọc PROGRESS.md và CLAUDE.md trong repo này.
Tiếp tục từ chỗ dừng.
Task tiếp theo: [TASK CỤ THỂ]
```
