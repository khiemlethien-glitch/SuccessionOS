# CLAUDE.md — SuccessionOS Frontend
> Đây là tài liệu tham chiếu nhanh cho Claude Code.
> Đọc file này + PROGRESS.md trước mỗi session.

---

## Tổng quan dự án

SuccessionOS là hệ thống quản lý kế thừa nhân tài (Succession Planning) cho doanh nghiệp.
Frontend Angular 18 kết nối trực tiếp Supabase (không có .NET backend — kế hoạch ban đầu đã đổi).

**Deploy:** Vercel → `https://succession-os-y6mt.vercel.app`
**Supabase project:** `psaidbntrvrzodurnisz.supabase.co`

---

## Tech Stack thực tế

| Layer | Công nghệ |
|---|---|
| Framework | Angular 18 (standalone components, signals) |
| UI | ng-zorro-antd (Ant Design for Angular) |
| Database | Supabase PostgreSQL (trực tiếp từ frontend) |
| Auth | Supabase Auth (email/password + Google OAuth) |
| AI | OpenAI GPT-4o — key lưu trong `environment.ts` (openaiKey) |
| Deploy | Vercel (SSR disabled, static build) |

---

## Folder structure

```
frontend/src/app/
├── core/
│   ├── auth/
│   │   └── auth.service.ts          ← Auth + role logic, UserProfile signal
│   ├── guards/
│   │   └── auth.guard.ts            ← Chỉ check isAuthenticated, chưa có role guard
│   └── services/data/
│       ├── employee.service.ts      ← CRUD employees (Supabase view: v_employees)
│       ├── succession.service.ts    ← Succession plans
│       ├── assessment.service.ts    ← Assessment cycles + scores
│       ├── career-roadmap.service.ts← AI roadmap (OpenAI GPT-4o)
│       ├── approval.service.ts      ← Approval workflow (Supabase tables)
│       ├── idp.service.ts           ← IDP plans
│       ├── key-position.service.ts  ← Key positions
│       ├── score-config.service.ts  ← Score weights config
│       └── employee-extras.service.ts ← Project, KT, 360° extras
├── shared/components/shell/
│   └── shell.component.ts           ← Layout + sidebar RBAC (canSee)
└── modules/
    ├── auth/login/                  ← Login page (4 demo chips)
    ├── dashboard/                   ← Dashboard (Line Manager trở lên)
    ├── talent/                      ← Talent list + profile + career roadmap
    ├── positions/                   ← Key positions
    ├── succession/                  ← Succession map
    ├── admin/                       ← Admin panel (approvals, users, audit, settings)
    ├── me/                          ← Redirect Viewer → /talent/:employee_id
    ├── idp/                         ← 🔲 Placeholder (chờ eLearning integration)
    ├── assessment/                  ← 🔲 Placeholder
    ├── mentoring/                   ← 🔲 Placeholder
    ├── calibration/                 ← 🔲 Placeholder
    ├── reports/                     ← 🔲 Placeholder
    └── marketplace/                 ← 🔲 Placeholder
```

---

## RBAC — 4 Roles

Hierarchy: `Admin > HR Manager > Line Manager > Viewer`

Implement trong `auth.service.ts`:
```typescript
readonly hasRole = (role: string): boolean => {
  const hierarchy = ['Viewer', 'Line Manager', 'HR Manager', 'Admin'];
  return userLevel >= neededLevel;
};
```

### Ma trận quyền

| Tính năng | Viewer | Line Manager | HR Manager | Admin |
|---|---|---|---|---|
| Dashboard | ❌ | ✅ | ✅ | ✅ |
| Talent list | ❌ | ✅ | ✅ | ✅ |
| Talent profile (người khác) | ❌ | ✅ | ✅ | ✅ |
| Hồ sơ của tôi (`/me`) | ✅ | ❌ | ❌ | ❌ |
| Vị trí then chốt | ❌ | ✅ | ✅ | ✅ |
| Bản đồ kế thừa | ❌ | ✅ | ✅ | ✅ |
| Tab Rủi ro trong profile | ❌ | ✅ | ✅ | ✅ |
| Admin panel (`/admin`) | ❌ | ✅ | ✅ | ✅ |
| Admin → tab Phê duyệt | ❌ | ✅ (xem + approve LM steps) | ✅ (xem tất cả + approve HRM steps) | ✅ (full) |
| Admin → tab Audit Trail | ❌ | ❌ | ✅ | ✅ |
| Admin → tab Người dùng | ❌ | ❌ | ❌ | ✅ |
| Admin → tab Cấu hình | ❌ | ❌ | ❌ | ✅ |
| Tạo AI Roadmap | ✅ (submit for approval) | ✅ (direct save) | ✅ | ✅ |
| Approve/Reject requests | ❌ | ✅ (LM steps only) | ✅ (HRM steps — bắt buộc) | ✅ (all) |

### Sidebar canSee logic
```typescript
canSee(item: NavItem): boolean {
  if (item.viewerOnly) return this.authService.isViewer();       // chỉ Viewer
  if (item.requiredRole) return this.authService.hasRole(item.requiredRole); // min role
  return true;
}
```

---

## Approval Workflow

### Bảng Supabase
- `approval_requests` — request chính (type, status, title, người tạo)
- `approval_steps` — các bước duyệt (approver_role, status, note)

### Approval steps theo role người tạo

| Người tạo | Steps (sequential — step sau chỉ mở khi step trước approved) |
|---|---|
| Admin | Tự động approved (no steps) |
| HR Manager | [Admin] |
| Line Manager | [**HR Manager** → Admin] |
| Viewer | [Line Manager (direct) → **HR Manager** → Admin] |
| Mentor request (mọi role) | [Line Manager (direct) → HR Manager] |

> **HR Manager là bước BẮT BUỘC** trong mọi workflow (trừ Admin tự approve và HRM tự gửi).
> Sequential: `currentUserStep()` chỉ return step khi tất cả step trước đó đã `approved`.

### Visibility & quyền trong Admin panel
- **Admin:** thấy tất cả, approve bước Admin
- **HR Manager:** thấy tất cả cty, approve bước HR Manager (sequential sau LM)
- **Line Manager:** chỉ thấy requests được giao (approver_id match), approve bước LM

### Approval types
`'idp' | 'succession' | 'position' | 'career_roadmap'`

---

## Demo Accounts (Supabase Auth)

| Email | Password | Role | Linked employee |
|---|---|---|---|
| admin@ptsc.vn | Admin@123! | Admin | Employee #1 (auto-picked) |
| hr.manager@ptsc.vn | Hr@123! | HR Manager | Employee #2 |
| lm.kythuat@ptsc.vn | Lm@123! | Line Manager | Employee #3 |
| viewer@ptsc.vn | Viewer@123! | Viewer | Employee #4 ← **phải có employee_id** |

> `user_profiles` table có cột `employee_id text` (thêm bằng migration).
> `loadProfile()` ưu tiên `employee_id` từ `user_profiles`, fallback lookup theo email trong `employees`.

---

## Database (Supabase) — bảng chính

| Bảng / View | Mô tả |
|---|---|
| `auth.users` | Supabase Auth users |
| `user_profiles` | Role, full_name, employee_id (link đến employees) |
| `v_employees` | View tổng hợp thông tin nhân viên (dùng trong employee.service) |
| `employees` | Bảng nhân viên gốc (id là kiểu **text**) |
| `departments` | Phòng ban |
| `key_positions` | Vị trí then chốt |
| `succession_plans` | Kế hoạch kế thừa |
| `assessment_cycles` | Chu kỳ đánh giá |
| `assessment_scores` | Điểm theo tiêu chí |
| `assessment_summary` | Tổng hợp điểm (view/materialized) |
| `external_scores` | Điểm tổng hợp ngoài (assessment_score + score_360) |
| `score_weight_config` | Tỉ trọng điểm (mặc định 60/40) |
| `career_roadmaps` | Lộ trình AI đã confirm |
| `approval_requests` | Yêu cầu phê duyệt |
| `approval_steps` | Các bước duyệt |
| `audit_logs` | Log hành động |
| `idp_plans` | IDP (chưa dùng nhiều) |
| `employee_extras` | Project, KT, 360° extra data |

> `employees.id` là kiểu **text** (không phải uuid) — quan trọng khi viết SQL.
> `employees.reports_to_id` — cột trỏ đến manager trực tiếp (text, không phải `parent_id`).
> `user_profiles.role` là ENUM type `user_role`: `'Admin' | 'HR Manager' | 'Line Manager' | 'Viewer'`

---

## ⚠️ Backend Integration — Điểm Quan Trọng Khi Import Data Thực

> Đây là các điểm **BẮT BUỘC** phải đúng khi nhận data từ client hoặc kết nối backend thật.
> Backend developer đọc kỹ phần này trước khi import/sync data.

### 1. `employees.reports_to_id` — Org Chart / Phân cấp báo cáo

```
employees.reports_to_id  (kiểu text, FK → employees.id)
```

- **Mục đích:** Xác định ai là Line Manager trực tiếp của mỗi nhân viên.
- **Dùng trong:** `approval.service.ts → resolveManagerUserId()` — quyết định request phê duyệt gửi đến LM nào.
- **Yêu cầu:** Phải được điền đầy đủ từ org chart khi import HRM data của client.
- **Nếu NULL:** Request sẽ hiện cho **tất cả** Line Manager (fallback an toàn, nhưng không đúng).
- **File cần chú ý:** `approval.service.ts` dòng ~280

### 2. `user_profiles.employee_id` — Link tài khoản ↔ nhân viên

```
user_profiles.employee_id  (kiểu text, FK → employees.id)
```

- **Mục đích:** Gắn tài khoản đăng nhập (Supabase Auth) với hồ sơ nhân viên trong DB.
- **Dùng trong:**
  - Viewer redirect về `/talent/:employee_id` sau login
  - `resolveManagerUserId()` để tìm LM của người gửi request
  - Filter phòng ban / department tree
- **Yêu cầu:**
  - **Mọi Line Manager** đều phải có `employee_id` được gán → nếu không, họ sẽ không nhận được request nào.
  - **Viewer** phải có `employee_id` → nếu không, redirect `/me` sẽ fail.
- **File cần chú ý:** `auth.service.ts → loadProfile()`, `me.component.ts`

### 3. Luồng routing tự động khi data đúng

```
Nhân viên A (Viewer) gửi request
  → employees[A].reports_to_id = B_employee_id
  → user_profiles WHERE employee_id = B AND role = 'Line Manager'
  → approval_steps.approver_id = B_user_id
  → LM B đăng nhập → Admin panel → chỉ thấy request của A (và team)
```

Khi import data thực với org chart đầy đủ, toàn bộ routing và filter phòng ban sẽ tự động đúng — **không cần thay đổi code**.

---

## Patterns quan trọng

### Signals (Angular 18)
```typescript
// Khai báo
mySignal = signal<Type>(initialValue);
myComputed = computed(() => ...);

// Dùng trong template
{{ mySignal() }}
@if (mySignal()) { ... }
```

### Supabase query pattern
```typescript
const { data, error } = await this.sb.client
  .from('table_name')
  .select('*')
  .eq('column', value)
  .maybeSingle();
```

### Route guard hiện tại
Chỉ có `authGuard` (check isAuthenticated).
**Chưa có role-based route guard** — RBAC chỉ ở sidebar (canSee) và component level.
Người dùng biết URL vẫn có thể truy cập trực tiếp.

---

## Files thường xuyên chỉnh sửa

| File | Mục đích |
|---|---|
| `core/auth/auth.service.ts` | Auth, UserProfile, hasRole, isViewer |
| `shared/components/shell/shell.component.ts` | Sidebar nav, RBAC canSee |
| `core/services/data/approval.service.ts` | Approval workflow |
| `modules/admin/admin.component.ts` | Admin panel logic |
| `modules/talent/talent-profile.component.ts` | Profile 1000+ dòng |
| `modules/talent/career-roadmap/career-roadmap.component.ts` | AI roadmap |
| `app.routes.ts` | Route definitions |
| `supabase/seeds/demo_users.sql` | Setup demo accounts |
