# PROGRESS.md — SuccessionOS Frontend
> File này được Claude Code tự cập nhật sau mỗi task.
> Khi mở session mới: đọc file này TRƯỚC để biết trạng thái hiện tại.
> Cập nhật lần cuối: 2026-04-22 16:30

---

## Trạng thái tổng quan

```
Project:  SuccessionOS Angular 18 Frontend
Stack:    Angular 18 + ng-zorro-antd + TypeScript
Dev:      localhost:4200
Mock:     public/mock/*.json (useMock: true)
Backend:  Dev team build .NET 8 API (chưa có)
Staging:  https://succession-os-y6mt.vercel.app
```

### Tiến độ tổng thể: ~85% █████████████████░░░

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
| IDP Module | ✅ Hoàn thành (P1) | 90% |
| Mentoring Module | ✅ Hoàn thành (P1) | 85% |
| Reports Module | ✅ Hoàn thành (P1) | 80% |
| Assessment Module | 🔲 Chưa làm | 0% |
| Calibration Module | 🔲 Chưa làm | 0% |
| Marketplace Module | 🔲 Chưa làm | 0% |
| RBAC / Permissions | 🔲 Chưa làm | 0% |

---

## ✅ Đã hoàn thành

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

- [x] **Prompt 4 — Dashboard KPI (2026-04-22)**
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

- [x] ~~**IDP Module**~~ ✅ **DONE P1** — list + filter + create/edit drawer + 3-level approval modal
- [ ] **Assessment Module** (`/assessment`) — tabs HRM360 + form nhập điểm + charts radar
- [x] ~~**Mentoring Module**~~ ✅ **DONE P1** — pairs grid + create pair drawer + logbook + add session
- [ ] **Calibration Module** (`/calibration`) — session list + 9-Box interactive + lock + audit
- [x] ~~**Reports Module**~~ ✅ **DONE P1** — Tổng quan + IDP Progress + Assessment tabs
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
- [ ] **P0**: Kết nối `GET /api/v1/me` thay vì đọc localStorage trong getCurrentUser()
- [ ] **P1**: Refactor talent-profile — thay full-list-then-filter bằng `GET /employees/{id}`, `GET /assessments/{id}/latest`, `GET /idp/{id}/employee`
- [ ] **P1**: Refactor dashboard — thay 3 full-list fetches bằng `GET /dashboard/kpi`
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
│       ├── idp/                      ✅ P1 — list + create/edit drawer + approval modal
│       ├── assessment/               🔲 Placeholder (disabled)
│       ├── mentoring/                ✅ P1 — pairs grid + create drawer + logbook drawer
│       ├── calibration/              🔲 Placeholder (disabled)
│       ├── reports/                  ✅ P1 — 4 tabs (Tổng quan + IDP Progress + Assessment + ROI)
│       └── marketplace/              🔲 Placeholder (disabled)
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
