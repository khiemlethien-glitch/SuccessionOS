# PROGRESS.md — SuccessionOS Frontend
> File này được Claude Code tự cập nhật sau mỗi task.
> Khi mở session mới: đọc file này TRƯỚC để biết trạng thái hiện tại.
> Cập nhật lần cuối: 2026-04-21 15:56

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

### Tiến độ tổng thể: ~72% ██████████████░░░░░░

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
| IDP Module | 🔲 Chưa làm | 0% |
| Assessment Module | 🔲 Chưa làm | 0% |
| Mentoring Module | 🔲 Chưa làm | 0% |
| Calibration Module | 🔲 Chưa làm | 0% |
| Reports Module | 🔲 Chưa làm | 0% |
| Marketplace Module | 🔲 Chưa làm | 0% |
| RBAC / Permissions | 🔲 Chưa làm | 0% |

---

## ✅ Đã hoàn thành

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

- [ ] **IDP Module** (`/idp`) — list cards + approval stepper 3 cấp + detail modal + draft status
- [ ] **Assessment Module** (`/assessment`) — tabs HRM360 + form nhập điểm + charts radar
- [ ] **Mentoring Module** (`/mentoring`) — pairs list + logbook + session tracking
- [ ] **Calibration Module** (`/calibration`) — session list + 9-Box interactive + lock + audit
- [ ] **Reports Module** (`/reports`) — charts + export PDF/Excel
- [ ] **Marketplace Module** (`/marketplace`) — module cards + filter tabs + pricing

### RBAC (sau khi UI xong)
- [ ] Role model: admin / moderator / user
- [ ] `PermissionDirective`: `*hasPermission="'employee.viewSalary'"`
- [ ] Sidebar ẩn/hiện theo role
- [ ] Table columns ẩn/hiện theo role (salary: số thực vs gap% vs ẩn)

### Backend Integration
- [ ] Wire real API khi .NET 8 backend sẵn sàng (useMock: false)
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
│       ├── idp/                      🔲 Placeholder (disabled)
│       ├── assessment/               🔲 Placeholder (disabled)
│       ├── mentoring/                🔲 Placeholder (disabled)
│       ├── calibration/              🔲 Placeholder (disabled)
│       ├── reports/                  🔲 Placeholder (disabled)
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
