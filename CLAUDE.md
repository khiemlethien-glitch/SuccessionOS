# CLAUDE.md — SuccessionOS Frontend
> Đây là tài liệu tham chiếu nhanh cho Claude Code.
> Đọc file này + PROGRESS.md trước mỗi session.

---

## Tổng quan dự án

SuccessionOS là hệ thống quản lý kế thừa nhân tài (Succession Planning) cho doanh nghiệp.
Frontend Angular 18 kết nối qua **PostgREST** đến PostgreSQL nội bộ.

**Deploy:** Vercel → `https://succession-os-y6mt.vercel.app`
**Backend DB:** `postgresql://postgres:postgres@172.21.55.5:5432/SuccessionOS`
**PostgREST API:** `http://172.21.55.5:3000`
**Supabase (dự phòng):** `psaidbntrvrzodurnisz.supabase.co` — không dùng chính nữa

---

## Tech Stack thực tế

| Layer | Công nghệ |
|---|---|
| Framework | Angular 18 (standalone components, signals) |
| UI | ng-zorro-antd (Ant Design for Angular) |
| Database | **PostgreSQL nội bộ** `172.21.55.5:5432` (primary) |
| API Layer | **PostgREST** `172.21.55.5:3000` — tự động REST từ PostgreSQL |
| Auth | **localStorage session** — email lookup trong `user_profiles` (bypass, chưa có JWT) |
| AI | OpenAI GPT-4o — key lưu trong `environment.ts` (openaiKey) |
| Deploy | Vercel (SSR disabled, static build) |
| Supabase | Dự phòng only — không dùng trong luồng chính |

---

## Kết nối Database trực tiếp (psql)

```bash
# Từ máy dev — chạy được trực tiếp
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
psql postgresql://postgres:postgres@172.21.55.5:5432/SuccessionOS

# Chạy SQL file
psql postgresql://postgres:postgres@172.21.55.5:5432/SuccessionOS -f migration.sql

# Chạy query nhanh
psql postgresql://postgres:postgres@172.21.55.5:5432/SuccessionOS -c "SELECT version();"
```

---

## Folder structure

```
frontend/src/app/
├── core/
│   ├── auth/
│   │   └── auth.service.ts          ← Auth + role logic, localStorage session
│   ├── guards/
│   │   └── auth.guard.ts            ← Chỉ check isAuthenticated
│   └── services/
│       ├── api.service.ts           ← PostgREST fetch client (primary DB client)
│       ├── supabase.service.ts      ← Compatibility shim → delegate sang ApiService
│       └── data/
│           ├── employee.service.ts      ← CRUD employees (view: v_employees)
│           ├── succession.service.ts    ← Succession plans
│           ├── assessment.service.ts    ← Assessment cycles + scores
│           ├── career-roadmap.service.ts← AI roadmap (OpenAI GPT-4o)
│           ├── approval.service.ts      ← Approval workflow
│           ├── idp.service.ts           ← IDP plans
│           ├── key-position.service.ts  ← Key positions
│           ├── score-config.service.ts  ← Score weights config
│           ├── mentoring.service.ts     ← Kèm cặp & Cố vấn
│           └── employee-extras.service.ts ← Project, KT, 360° extras
├── shared/components/shell/
│   └── shell.component.ts           ← Layout + sidebar RBAC (canSee)
└── modules/
    ├── auth/login/                  ← Login page (4 demo accounts)
    ├── dashboard/                   ← Dashboard (Line Manager trở lên)
    ├── talent/                      ← Talent list + profile + career roadmap
    ├── positions/                   ← Key positions
    ├── succession/                  ← Succession map
    ├── admin/                       ← Admin panel (approvals, users, audit, settings)
    ├── me/                          ← Redirect Viewer → /talent/:employee_id
    ├── mentoring/                   ← Kèm cặp & Cố vấn ✅
    ├── idp/                         ← 🔲 Placeholder
    ├── assessment/                  ← 🔲 Placeholder
    ├── calibration/                 ← 🔲 Placeholder
    ├── reports/                     ← 🔲 Placeholder
    └── marketplace/                 ← 🔲 Placeholder
```

---

## Query Pattern (PostgREST via ApiService)

Tất cả data services dùng cú pháp **giống hệt Supabase** qua `SupabaseService` shim:

```typescript
// Inject
private sb = inject(SupabaseService).client;  // trả về ApiService.db (any)

// Query — cú pháp không đổi so với Supabase
const { data, error } = await this.sb
  .from('v_employees')
  .select('id, full_name, position')
  .eq('department_id', deptId)
  .order('full_name')
  .maybeSingle();

// INSERT
const { data, error } = await this.sb
  .from('mentoring_pairs')
  .insert({ mentor_id, mentee_id, status: 'PendingMentor' })
  .select()
  .maybeSingle();

// UPDATE
await this.sb
  .from('mentoring_pairs')
  .update({ status: 'Active' })
  .eq('id', pairId);
```

> **Lưu ý:** 5 data service files có `// @ts-nocheck` ở đầu — migration phase, schema codegen chưa có. Không cần bỏ cho đến khi có TypeScript types từ DB.

---

## Auth (localStorage-based, bypass mode)

```typescript
// Login: query user_profiles by email (no password check)
const { data: profile } = await this.api.db
  .from('user_profiles')
  .select('*')
  .eq('email', email)
  .maybeSingle();

// Session lưu trong localStorage key: 'sos_session'
// isAuthenticated = computed(() => session() !== null)
```

---

## Demo Accounts (PostgreSQL `user_profiles`)

| Email | Password | Role | Employee |
|---|---|---|---|
| admin@ptsc.vn | bất kỳ | Admin | Đỗ Minh Sơn (TGĐ) |
| hr.manager@ptsc.vn | bất kỳ | HR Manager | Hồ Thanh Nguyên (GĐ Nhân Sự) |
| lm.kythuat@ptsc.vn | bất kỳ | Line Manager | Vũ Hữu Đức (GĐ Tài Chính) |
| viewer@ptsc.vn | bất kỳ | Viewer | Lê Tú Nguyên (TP C&B) |

> Password không được kiểm tra — chỉ cần email tồn tại trong `user_profiles`.
> Để thêm user mới: `INSERT INTO user_profiles (id, email, full_name, role, employee_id) VALUES (gen_random_uuid(), ...)`

---

## RBAC — 4 Roles

Hierarchy: `Admin > HR Manager > Line Manager > Viewer`

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
| Kèm cặp & Cố vấn | ✅ | ✅ | ✅ | ✅ |
| Tab Rủi ro trong profile | ❌ | ✅ | ✅ | ✅ |
| Admin panel (`/admin`) | ❌ | ✅ | ✅ | ✅ |
| Admin → tab Phê duyệt | ❌ | ✅ (LM steps) | ✅ (read-only) | ✅ (full) |
| Admin → tab Audit Trail | ❌ | ❌ | ✅ | ✅ |
| Admin → tab Người dùng | ❌ | ❌ | ❌ | ✅ |
| Admin → tab Cấu hình | ❌ | ❌ | ❌ | ✅ |
| Tạo AI Roadmap | ✅ (submit for approval) | ✅ (direct save) | ✅ | ✅ |

---

## Approval Workflow

### Tables (PostgreSQL nội bộ)
- `approval_requests` — request chính (type, status, title, người tạo)
- `approval_steps` — các bước duyệt (approver_role, status, note)

### Steps theo role người tạo

| Người tạo | Steps |
|---|---|
| Admin | Tự động approved |
| HR Manager | [Admin] |
| Line Manager | [HR Manager → Admin] |
| Viewer | [Line Manager → HR Manager → Admin] |
| Mentor request | [Line Manager → HR Manager] |

---

## Database (PostgreSQL nội bộ) — bảng chính

| Bảng / View | Mô tả |
|---|---|
| `user_profiles` | Role, full_name, employee_id — **không có password** |
| `v_employees` | View tổng hợp nhân viên (primary query target) |
| `employees` | Bảng nhân viên gốc — id là **UUID** |
| `departments` | Phòng ban |
| `key_positions` | Vị trí then chốt |
| `succession_plans` | Kế hoạch kế thừa |
| `assessment_cycles` | Chu kỳ đánh giá |
| `assessment_scores` | Điểm theo tiêu chí |
| `assessment_summary` | Tổng hợp điểm (view) |
| `external_scores` | Điểm tổng hợp |
| `score_weight_config` | Tỉ trọng điểm |
| `career_roadmaps` | Lộ trình AI đã confirm |
| `approval_requests` | Yêu cầu phê duyệt |
| `approval_steps` | Các bước duyệt |
| `audit_logs` | Log hành động |
| `idp_plans` | IDP |
| `employee_extras` | Project, KT, 360° extra |
| `mentoring_pairs` | Cặp kèm cặp — enum `mentoring_status` PascalCase |
| `mentoring_sessions` | Buổi kèm cặp |
| `v_nine_box` | View 9-box grid |

> `employees.id` là **UUID** (khác Supabase — kiểu text trước đây).
> `employees.reports_to_id` — FK trỏ đến manager trực tiếp.
> `mentoring_pairs.status` dùng enum `mentoring_status`: `Active`, `Completed`, `Paused`, `PendingMentor`, `PendingLM`, `PendingHR`, `Rejected`, `Cancelled`

---

## Chạy Schema / Migration mới

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"

# Chạy file SQL
psql postgresql://postgres:postgres@172.21.55.5:5432/SuccessionOS -f supabase/migrations/xxx.sql

# Hoặc inline
psql postgresql://postgres:postgres@172.21.55.5:5432/SuccessionOS -c "ALTER TABLE ..."
```

---

## Files thường xuyên chỉnh sửa

| File | Mục đích |
|---|---|
| `core/auth/auth.service.ts` | Auth, UserProfile, hasRole, localStorage session |
| `core/services/api.service.ts` | PostgREST fetch client — QueryBuilder |
| `core/services/supabase.service.ts` | Shim → ApiService.db |
| `shared/components/shell/shell.component.ts` | Sidebar nav, RBAC canSee |
| `core/services/data/approval.service.ts` | Approval workflow |
| `modules/admin/admin.component.ts` | Admin panel logic |
| `modules/talent/talent-profile.component.ts` | Profile |
| `modules/mentoring/mentoring.component.ts` | Kèm cặp module |
| `app.routes.ts` | Route definitions |
| `src/environments/environment.ts` | API URL config (gitignored) |
| `src/environments/environment.prod.example.ts` | Template cho Vercel build |
