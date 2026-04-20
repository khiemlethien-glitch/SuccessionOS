# PROGRESS.md — SuccessionOS Frontend
> File này được Claude Code tự cập nhật sau mỗi task.
> Khi mở session mới: đọc file này TRƯỚC để biết trạng thái hiện tại.
> Cập nhật lần cuối: 2026-04-21 02:45

---

## Trạng thái tổng quan

```
Project:  SuccessionOS Angular 18 Frontend
Stack:    Angular 18 + ng-zorro-antd + TypeScript
Dev:      localhost:4200
Mock:     public/mock/*.json (useMock: true)
Backend:  Dev team build .NET 8 API (chưa có)
```

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
- [x] `core/guards/auth.guard.ts` — Redirect /login nếu chưa auth
- [x] `core/interceptors/jwt.interceptor.ts` — Auto attach Authorization header

### Layout Shell
- [x] `app.component.html` — nz-layout + nz-sider sidebar
- [x] Sidebar background: #1E1B4B (navy)
- [x] Logo "SuccessionOS" + tenant "PTSC M&C"
- [x] User info footer: avatar HA + tên + role
- [x] Header: bell icon + user name + avatar
- [x] Menu groups: Quản lý nhân tài / Phát triển / Phân tích / Hệ thống

### UI tweaks (theo prototype/Figma)
- [x] Shell layout: sidebar theme light + spacing theo Figma
- [x] Removed top header bar (màu xanh) theo yêu cầu mới
- [x] Sidebar brand: dùng `logo/logo.png` (served as `/logo.png`) ✅
- [x] Sidebar compact 240px + user profile dropdown ✅
- [x] Dashboard KPI cards: màu nhẹ theo ngữ nghĩa (blue/green/red/amber) + gradient nền + accent border trái + halo icon ✅
- [x] Dashboard donut "Phân bổ tầng nhân sự": SVG donut 4 tier (thêm "Chưa phân bổ"), tâm hiện tổng, hover highlight, legend có count+% (mock 12% unassigned, sẽ nối API sau) ✅
- [x] Fix alignment risk list: `align-items:start` cho top-grid (cards không stretch), row hover bg inset + rounded, bỏ border-bottom dùng gap ✅
- [x] Dashboard "12 Vị trí Then chốt" — redesign card to + màu theo readiness tone (good/warn/bad: green/amber/red) + accent border trái + gradient + halo + pulse dot + hover lift ✅
- [x] Shell sidebar: sticky position (top:0, height:100vh) — luôn trong viewport khi scroll page, profile pin dưới cùng, nav scroll internal nếu dài ✅
- [x] Talent List redesign: mini-stats chip pill màu (blue/red/indigo), bo tròn 16px, cột gọn (1100px + nzScroll), bỏ email, bỏ nút "Xem hồ sơ" → row clickable + chevron hover, Overall score dạng badge green gradient, bar gradient Perf/Pot ✅
- [x] Positions page redesign: hero header gradient indigo, stats strip 4 chip màu, position cards tone theo criticalLevel (red/amber/blue/green) + accent bar + halo + gradient bg, nút "Thêm vị trí" gradient indigo-purple ✅
- [x] Add Position modal: drag-drop competencies (CDK drag-drop + click fallback), segmented critical level, form validation, auto-add to local list (mock) ✅
- [x] Succession 9-Box redesign: hero header gradient + stats (Ngôi sao / Tổng / Cần xử lý), 6-tone color system (star/great/core/watch/risk/low) + gradient + halo, axis labels Y/X modern, legend swatches ✅
- [x] "Điều chỉnh thang đo" modal: nzSlider range cho Performance & Potential thresholds, preview count 3 mức (low/mid/high), nút Mặc định + Áp dụng, badge báo khi thang đo khác default ✅
- [x] Talent Profile (`/talent/:id`) redesign: breadcrumb, risk banner (pink) với reasons chips khi riskScore≥60, hero 3-column (identity + metrics 2×2 bars + accent cards 2×2), pills tier/ready/IDP, mentor empty state — khớp prototype ✅
- [x] Talent Profile: mentor row có nút `+` → mở modal picker (senior Nòng cốt/Kế thừa, ≥8 năm), search theo tên/vị trí/phòng ban, click gán; có nút `×` bỏ gán ✅
- [x] Talent Profile charts row: (1) Radar "Hồ sơ năng lực" SVG pentagon 5 trục Kỹ thuật/Hiệu suất/Hành vi/Tiềm năng/Lãnh đạo, so sánh thực tế vs mục tiêu, badge vượt/cần cải thiện, 5 cột số + delta; (2) Network "Mạng lưới phát triển" hub-spoke (center=talent, Mục tiêu/Mentor/KTP/IDP + mentees), SVG edges + HTML nodes, click mentor/mentee để chuyển center ✅
- [x] Talent Profile "Yếu tố rủi ro" card collapsible: header (icon warning + title + badge "Risk X · N yếu tố"), alert strip "Cao hơn X% trung bình phòng" (compute từ avg dept riskScore), list factors có dot màu theo severity + title/detail + tags (source + date) ✅
- [x] Talent Profile "Kết quả đánh giá 360°" card collapsible (header indigo gradient): summary điểm tổng hợp + nguồn (QL/ĐN/CĐ), list 13 tiêu chí (dot xanh + score + bar /5 + /4.5 benchmark), blocks Điểm mạnh / Cần phát triển / Nhận xét quản lý (italic quote) / Điểm thành phần (0-100) pull từ talent. Data hardcode tạm thời, sẽ fetch backend sau ✅
- [x] Talent Profile review grid (2-col): (L) Đánh giá năng lực — 4 bars weighted 40/30/20/10 + overall score big number + Điểm mạnh/Cần phát triển 2-col + manager quote, (R) Dự án hiện tại (name/EPC tag/role/client/value/status) + Thống kê nhanh 2×2 (training hrs/last promotion/IDP/risk). L col cũng có IDP card (target position + status badge + progress bar đỏ + Mục tiêu 12m/2-3y với icons). Tất cả data hardcode readonly, chú thích endpoint `/api/v1/talents/:id/...` để fetch sau ✅
- [x] Talent Profile "Chuyển giao Tri thức" card: header (successor name + progress bar indigo + start/target dates), list knowledge items mỗi row (status dot green/amber/gray + title + category chip + status + individual progress bar + %) ✅
- [x] Talent Profile: chỉ xóa tab "Năng lực" trong tabs-card (trùng với radar chart), giữ 3 tab còn lại (Đánh giá 360°, Kế hoạch IDP, Lịch sử) ✅
- [x] Admin page redesign toàn bộ: hero gradient navy→indigo + 4 stats (users/talents/positions/events), tabs bar pill-style 5 tab (Tổng quan/Dữ liệu/Người dùng/Cấu hình/Audit). Tổng quan: recent activity + data summary grid click-through. Dữ liệu: sidebar chọn 8 entities (Talents/Positions/IDP/Assessments/Succession/Mentoring/Calibration/Users) + data grid với search + Add/Edit/Delete popconfirm, generic edit modal auto-gen fields theo entity columns. Người dùng: table users CRUD với role tags. Cấu hình: module toggles grid (core/pro/enterprise tier) với nz-switch. Audit Trail: table logs với action tags màu ✅

### Placeholder routes
- [x] `/profile` — ProfileComponent placeholder ✅
- [x] `/settings` — SettingsComponent placeholder ✅

### Routing (Lazy loaded)
- [x] `/dashboard` → DashboardModule
- [x] `/login` → AuthModule (fake login) ✅
- [x] `/talent` → TalentModule
- [x] `/succession` → SuccessionModule
- [x] `/idp` → IdpModule
- [x] `/assessment` → AssessmentModule
- [x] All routes protected by authGuard

### Mock Data
- [x] `public/mock/talents.json` — nhân viên mẫu
- [x] `public/mock/succession-plans.json` — succession plan mẫu
- [x] `public/mock/idp.json` — IDP mẫu

### Icons & App Config
- [x] `app.config.ts` — `provideNzIcons([...])` đầy đủ 36 icons cho toàn app (fix lỗi user-o, safety-certificate-o)

### Components đã build (session trước)
- [x] `shared/components/stat-card/` — StatCardComponent
- [x] `shared/components/avatar/` — AvatarComponent  
- [x] `shared/components/risk-badge/` — RiskBadgeComponent
- [x] `shared/components/tier-badge/` — TierBadgeComponent
- [x] `shared/components/shell/` — ShellComponent (layout sidebar + header)
- [x] `modules/dashboard/` — DashboardComponent: KPI cards + high risk table + positions cần chú ý + IDP progress bars

---

## 🔲 Chưa làm

### Components cần build
- [x] Dashboard — KPI cards + high risk table + IDP progress ✅
- [x] Talent List — prototype UI + filter/sort + bind mock talents + IDP ✅
- [x] LoginComponent — split layout + fake login qua AuthService ✅
- [x] LoginComponent — compact layout fit 100vh ✅
- [x] Talent Profile — hero redesign (breadcrumb + risk banner + 3-col hero + tabs) ✅
- [ ] Key Positions — grid cards + dependency score
- [ ] Succession Map — 9-Box grid + succession list
- [ ] IDP — list cards + approval stepper + detail modal
- [ ] Assessment — tabs + form nhập điểm + charts
- [ ] Mentoring — pairs list + logbook
- [ ] Calibration — session list + 9-Box interactive
- [ ] Reports — charts + export
- [ ] Marketplace — module cards + filter tabs
- [ ] Admin Panel — CRUD tables + user management

### RBAC (sau khi UI xong)
- [ ] Role model: admin / moderator / user
- [ ] PermissionDirective: *hasPermission="'employee.viewSalary'"
- [ ] Sidebar ẩn/hiện theo role
- [ ] Table columns ẩn/hiện theo role

### Shared Components
- [ ] TierBadgeComponent
- [ ] RiskBadgeComponent
- [ ] AvatarComponent
- [ ] StatCardComponent

---

## 🐛 Bugs cần fix

| Bug | File | Ưu tiên |
|---|---|---|
| SSR server deep-link có thể 404 (“Cannot GET /route”) → fallback serve `index.csr.html`/`index.html` nếu có | `frontend/src/server.ts` | High ✅ |
| Dev SSR crash `localStorage is not defined` (AuthService chạy trên server) → guard localStorage chỉ ở browser | `frontend/src/app/core/auth/auth.service.ts` | High ✅ |
| Local `:4200` trả “Cannot GET /dashboard” do process không phải `ng serve` → kill port + chạy `npm start` trong `frontend/` | env/process | High ✅ |
| SSR crash `localStorage is not defined` trong ShellComponent.currentUser → dùng AuthService.getCurrentUser() thay vì đọc trực tiếp localStorage, sửa field `name` → `fullName` | `frontend/src/app/shared/components/shell/shell.component.ts` | High ✅ |

---

## File structure hiện tại

```
frontend/src/
├── app/
│   ├── app.ts                       ← Root component ✅
│   ├── app.config.ts                ← Providers + Icons ✅ (fixed)
│   ├── app.routes.ts                ← Routing ✅
│   ├── core/
│   │   ├── services/api.service.ts  ✅
│   │   ├── auth/auth.service.ts     ✅
│   │   ├── guards/auth.guard.ts     ✅
│   │   ├── interceptors/jwt.interceptor.ts ✅
│   │   └── models/models.ts         ✅
│   ├── shared/components/
│   │   ├── shell/                   ✅ Layout sidebar + header
│   │   ├── stat-card/               ✅
│   │   ├── avatar/                  ✅
│   │   ├── risk-badge/              ✅
│   │   └── tier-badge/              ✅
│   └── modules/
│       ├── dashboard/               ✅ KPI + table + IDP bars
│       ├── talent/                  🔲 Cần build
│       ├── positions/               🔲 Placeholder
│       ├── succession/              🔲 Placeholder
│       ├── idp/                     🔲 Placeholder
│       └── assessment/              🔲 Placeholder
├── environments/
│   ├── environment.ts               ✅
│   └── environment.prod.ts          ✅
└── public/mock/
    ├── talents.json                 ✅ 25 employees
    ├── positions.json               ✅ 12 positions
    ├── idp-plans.json               ✅
    ├── succession-plans.json        ✅
    └── (+ 5 more mock files)        ✅
```

---

## Prototype tham khảo

- Staging: https://succession-os-git-staging-lethienkhiems-projects.vercel.app
- CLAUDE.md Notion: https://www.notion.so/34819261e1f18157a277dd5116103f22

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

## Cách mở session mới trong Claude Code

```
Đọc PROGRESS.md và CLAUDE.md trong repo này.
Tiếp tục từ chỗ dừng.
Task tiếp theo: [TASK CỤ THỂ]
```
