# SuccessionOS — Database Schema

> **Generated:** 2026-04-27  
> **Supabase project:** `psaidbntrvrzodurnisz.supabase.co`  
> **Source:** Migration files in `supabase/migrations/` + seed files in `supabase/seeds/`  
> **Note:** This is the FINAL schema state after applying all migrations in chronological order.

---

## Enums

### `user_role`
PostgreSQL ENUM type — used in `user_profiles.role`

| Value | Description |
|-------|-------------|
| `Admin` | Highest privilege — full access |
| `HR Manager` | Company-wide access, approves HRM steps |
| `Line Manager` | Team-scoped access, approves LM steps |
| `Viewer` | Read-only own profile |

---

## Tables

### `user_profiles`
Links Supabase Auth users to their application role and linked employee record.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NOT NULL | — | PK — matches `auth.users.id` |
| `email` | text | YES | — | User email |
| `full_name` | text | YES | — | Display name |
| `role` | user_role (ENUM) | YES | — | RBAC role: `Admin`, `HR Manager`, `Line Manager`, `Viewer` |
| `employee_id` | text | YES | — | FK → `employees.id` (text, not uuid) |

**RLS Policies (final state):**
- `user_profiles_select_own` (SELECT): `id = auth.uid()` — users read own profile only
- `user_profiles_update_own` (UPDATE): `id = auth.uid()` — users update own profile only
- No INSERT policy — use service_role or Auth hook to create profiles

**Note:** RLS was disabled in dev migration `20260424_fix_rls_and_schema.sql` — check current production state.

---

### `departments`
Organizational department hierarchy.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text/uuid | NOT NULL | — | PK |
| `name` | text | NOT NULL | — | Department name (full) |
| `parent_id` | text/uuid | YES | NULL | Self-referential FK for hierarchy |

**RLS:** Disabled for dev (`20260424_disable_rls_dev.sql`).

---

### `employees`
Core employee table. `id` is TEXT (not uuid) — important for all FK relationships.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NOT NULL | — | PK — e.g. `E001`, `E002` |
| `full_name` | text | NOT NULL | — | Full name (Vietnamese) |
| `email` | text | YES | — | Work email |
| `position` | text | YES | — | Job title / position name |
| `department` | text | YES | — | Department name (denormalized) |
| `department_id` | text/uuid | YES | — | FK → `departments.id` |
| `hire_date` | date | YES | — | Date of hire |
| `years_of_experience` | integer | YES | — | Total years of experience |
| `talent_tier` | text | YES | — | `Nòng cốt` / `Tiềm năng` / `Kế thừa` |
| `potential_level` | text | YES | — | `Very High` / `High` / `Medium` / `Low` |
| `potential_score` | numeric | YES | — | 0–100 potential score |
| `performance_score` | numeric | YES | — | 0–100 performance score |
| `risk_score` | numeric | YES | — | 0–100 attrition/departure risk |
| `readiness_level` | text | YES | — | `Ready Now` / `Ready in 1 Year` / `Ready in 2 Years` |
| `risk_reasons` | jsonb | YES | `[]` | Array of risk reason strings |
| `departure_reasons` | jsonb | YES | `[]` | Array of departure reason strings |
| `mentor_name` | text | YES | — | Assigned mentor name |
| `target_position` | text | YES | — | Target/aspired position |
| `reports_to_id` | text | YES | — | FK → `employees.id` — direct manager (CRITICAL for approval routing) |
| `comp_technical` | numeric | YES | — | Competency score: technical (0–100) |
| `comp_leadership` | numeric | YES | — | Competency score: leadership (0–100) |
| `comp_communication` | numeric | YES | — | Competency score: communication (0–100) |
| `comp_problem_solving` | numeric | YES | — | Competency score: problem solving (0–100) |
| `comp_adaptability` | numeric | YES | — | Competency score: adaptability (0–100) |
| `comp_target_technical` | numeric | YES | — | Target competency: technical |
| `comp_target_leadership` | numeric | YES | — | Target competency: leadership |
| `comp_target_communication` | numeric | YES | — | Target competency: communication |
| `comp_target_problem_solving` | numeric | YES | — | Target competency: problem solving |
| `comp_target_adaptability` | numeric | YES | — | Target competency: adaptability |
| `is_active` | boolean | YES | `true` | Soft-delete flag |
| `ktp_progress` | integer | YES | — | Knowledge transfer progress % |
| `overall_score` | numeric | YES | — | Composite score |
| `tenure_years` | numeric | YES | — | Computed years of tenure |

**RLS Policies (after security migration):**
- `employees_select` (SELECT, authenticated): `true` — all logged-in users see all employees
- `employees_insert` (INSERT, authenticated): `is_hr_or_admin()` — HR Manager or Admin only
- `employees_update` (UPDATE, authenticated): `is_hr_or_admin()`
- `employees_delete` (DELETE, authenticated): `is_admin()`

**RLS disabled in dev** via `20260424_fix_rls_and_schema.sql`.

---

### `key_positions`
Key/critical positions for succession planning.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `title` | text | NOT NULL | — | Position title |
| `department` | text | YES | — | Department name (denormalized) |
| `department_id` | text/uuid | YES | — | FK → `departments.id` |
| `department_name` | text | YES | — | Alias for department name |
| `critical_level` | text | YES | — | `Critical` / `High` / `Medium` / `Low` |
| `risk_level` | text | YES | — | `High` / `Medium` / `Low` |
| `current_holder_id` | text | YES | — | FK → `employees.id` — current incumbent |
| `current_holder` | text | YES | — | Holder name (denormalized) |
| `holder_name` | text | YES | — | Alias for holder name |
| `successor_count` | integer | YES | `0` | Number of successors |
| `ready_now_count` | integer | YES | `0` | Successors ready now |
| `required_competencies` | jsonb | YES | `[]` | Array of competency key strings |
| `competency_scores` | jsonb | YES | `{}` | Target scores per competency: `{"leadership": 80, "technical": 75, ...}` |
| `parent_position_id` | uuid | YES | NULL | FK → `key_positions.id` — organizational hierarchy |
| `is_active` | boolean | YES | `true` | Soft-delete flag |

**RLS Policies (after security migration):**
- `key_positions_select` (SELECT, authenticated): `true`
- `key_positions_write` (ALL, authenticated): `is_hr_or_admin()`

**RLS disabled in dev** via `20260424_fix_rls_and_schema.sql`.

---

### `succession_plans`
Maps successors (employees) to key positions with readiness and priority.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `position_id` | uuid | NOT NULL | — | FK → `key_positions.id` |
| `talent_id` | text | NOT NULL | — | FK → `employees.id` |
| `readiness` | text | YES | — | `Ready Now` / `Ready in 1 Year` / `Ready in 2 Years` |
| `priority` | integer | YES | — | Sort order (1 = top successor) |
| `gap_score` | numeric | YES | — | Competency gap score (0–100) |

**RLS Policies:**
- `succession_plans_select` (SELECT, authenticated): `true`
- `succession_plans_write` (ALL, authenticated): `is_hr_or_admin()`

**RLS disabled in dev** via `20260424_fix_rls_and_schema.sql`.

---

### `assessment_cycles`
Assessment cycle definitions (e.g., "Chu kỳ 2025").

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid/text | NOT NULL | — | PK |
| `name` | text | NOT NULL | — | Cycle display name, e.g. `Chu kỳ 2025` |
| `type` | text | YES | — | Cycle type |
| `start_date` | date | YES | — | Start date |
| `end_date` | date | YES | — | End date |
| `status` | text | YES | — | `active` / `closed` |
| `sort_order` | integer | YES | — | Display order |

---

### `assessment_criteria`
KPI / competency criteria used in assessment cycles.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid/text | NOT NULL | — | PK |
| `key` | text | NOT NULL | — | Machine key, e.g. `leadership`, `technical` |
| `label` | text | NOT NULL | — | Display label (Vietnamese) |
| `description` | text | YES | — | Criterion description |
| `weight` | numeric | YES | — | Weight in percentage |
| `category` | text | YES | — | Grouping category |
| `sort_order` | integer | YES | `0` | Display order |
| `is_active` | boolean | YES | `true` | Whether to include in scoring |
| `assessment_type` | text | NOT NULL | `'kpi'` | `kpi` or `360` — added in migration `20260423_assessment_types.sql` |

**Indexes:**
- `assessment_criteria_type_idx` ON `assessment_type` WHERE `is_active = true`

**RLS:** Disabled for dev via `20260424_disable_rls_dev.sql`.

---

### `assessment_scores`
Individual criterion scores per employee per cycle.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `employee_id` | text | NOT NULL | — | FK → `employees.id` |
| `cycle_id` | text/uuid | NOT NULL | — | FK → `assessment_cycles.id` |
| `criterion_id` | text/uuid | NOT NULL | — | FK → `assessment_criteria.id` |
| `score` | numeric(6,2) | YES | — | Score value (0–100 for KPI; 0–5 for 360°) |
| `created_at` | timestamptz | YES | `now()` | Record creation timestamp |

**Unique constraint:** `(employee_id, cycle_id, criterion_id)`

---

### `assessment_summary`
Aggregated overall score per employee per cycle and assessment type.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `employee_id` | text | NOT NULL | — | FK → `employees.id` |
| `cycle_id` | text/uuid | NOT NULL | — | FK → `assessment_cycles.id` |
| `overall_score` | numeric(6,2) | YES | — | Average score across all criteria |
| `rating_label` | text | YES | — | `Xuất sắc` / `Tốt` / `Đạt` / `Cần cải thiện` |
| `manager_note` | text | YES | — | Manager comment |
| `strengths` | jsonb | YES | `[]` | Array of strength strings |
| `needs_dev` | jsonb | YES | `[]` | Array of development areas |
| `assessment_type` | text | NOT NULL | `'kpi'` | `kpi` or `360` — added in migration `20260423_assessment_types.sql` |
| `updated_at` | timestamptz | YES | `now()` | Last update timestamp |

**Unique constraint:** `(employee_id, cycle_id, assessment_type)` — added in migration `20260423_assessment_types.sql` (replaces old `(employee_id, cycle_id)` constraint)

**Rating label thresholds:**
- `Xuất sắc`: score >= 90
- `Tốt`: score >= 75
- `Đạt`: score >= 60
- `Cần cải thiện`: score < 60

---

### `assessment_display_config`
Admin configuration for which criteria to display prominently in the UI.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NOT NULL | — | PK |
| `criterion_id` | text/uuid | YES | — | FK → `assessment_criteria.id` |
| `display_order` | integer | YES | — | Sort order |
| (other config columns) | — | — | — | UI display settings |

**RLS:** Disabled for dev via `20260424_disable_rls_dev.sql`.

---

### `external_scores`
Scores imported from external HR systems (competency assessment + 360° feedback).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `employee_id` | text | NOT NULL | — | FK → `employees.id` (part of PK) |
| `cycle_id` | text | NOT NULL | — | FK → `assessment_cycles.id` (part of PK) |
| `assessment_score` | numeric(6,2) | YES | — | Competency assessment score (from HR system) |
| `score_360` | numeric(6,2) | YES | — | 360° feedback score |
| `criteria_json` | jsonb | YES | `[]` | Detailed 360° criteria breakdown |
| `updated_at` | timestamptz | YES | `now()` | Last update timestamp |

**Primary Key:** `(employee_id, cycle_id)`

**RLS Policies (after security migration):**
- `external_scores_select` (SELECT, authenticated): `true`
- `external_scores_write` (ALL, authenticated): `is_hr_or_admin()`

**RLS disabled in dev** via `20260424_disable_rls_dev.sql`.

---

### `score_weight_config`
Singleton configuration for score weighting (only 1 row, id=1).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | integer | NOT NULL | `1` | PK — always 1 (singleton) |
| `assessment_weight` | integer | NOT NULL | `60` | % weight for competency assessment score |
| `weight_360` | integer | NOT NULL | `40` | % weight for 360° score |
| `updated_at` | timestamptz | YES | `now()` | Last update timestamp |

**Constraints:**
- `weights_sum_100`: `assessment_weight + weight_360 = 100`
- `single_row`: `id = 1`

**Default seed:** `(1, 60, 40)` — 60% assessment, 40% 360°

**RLS Policies (after security migration):**
- `score_weight_config_select` (SELECT, authenticated): `true`
- `score_weight_config_write` (ALL, authenticated): `is_admin()` — Admin only

**RLS disabled in dev** via `20260424_disable_rls_dev.sql`.

---

### `career_roadmaps`
AI-generated career development roadmaps, confirmed by HR/manager.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `employee_id` | text | NOT NULL | — | FK → `employees.id` |
| `track` | text | NOT NULL | — | CHECK: `expert` or `manager` |
| `status` | text | NOT NULL | `'confirmed'` | Roadmap status |
| `ai_summary` | text | YES | — | AI-generated summary narrative |
| `confidence_score` | integer | YES | — | AI confidence 0–100 |
| `estimated_timeline` | text | YES | — | Timeline description |
| `target_position` | text | YES | — | Target role name |
| `strengths` | jsonb | NOT NULL | `[]` | Array of strength strings |
| `challenges` | jsonb | NOT NULL | `[]` | Array of challenge strings |
| `alternative_path` | text | YES | — | Alternative career path description |
| `skill_gaps` | jsonb | NOT NULL | `[]` | Skill gap items |
| `phases` | jsonb | NOT NULL | `[]` | Development phases with milestones |
| `generated_at` | timestamptz | YES | `now()` | When AI generated this roadmap |
| `confirmed_at` | timestamptz | YES | — | When HR/manager confirmed |
| `confirmed_by` | text | YES | — | User who confirmed |

**Unique constraint:** `(employee_id, track)` — one roadmap per track per employee

**Index:** `idx_career_roadmaps_employee` ON `employee_id`

**RLS Policies (after security migration):**
- `career_roadmaps_select` (SELECT, authenticated): own `employee_id` OR `is_hr_or_admin()`
- `career_roadmaps_write` (ALL, authenticated): `is_hr_or_admin()`

**RLS disabled in dev** via `20260424_disable_rls_dev.sql`.

---

### `employee_extras`
Per-employee extended data: current project, knowledge transfer plan, 360° assessment, quick stats.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `employee_id` | text | NOT NULL | — | PK — FK → `employees.id` |
| `project_name` | text | YES | — | Current project name |
| `project_type` | text | YES | — | Project type/category |
| `project_role` | text | YES | — | Employee's role in project |
| `project_client` | text | YES | — | Client name |
| `project_value` | text | YES | — | Project value (string, e.g. `15 tỷ VND`) |
| `project_status` | text | YES | `'active'` | Project status |
| `kt_successor` | text | YES | — | Knowledge transfer successor employee_id |
| `kt_successor_role` | text | YES | — | Successor's role title |
| `kt_start_date` | date | YES | — | KT start date |
| `kt_target_date` | date | YES | — | KT target completion date |
| `kt_overall_progress` | integer | YES | `0` | KT overall progress % |
| `kt_items` | jsonb | YES | `[]` | Array of KT topic items |
| `a360_overall` | numeric(5,2) | YES | — | 360° overall score |
| `a360_benchmark` | numeric(5,2) | YES | `5` | Benchmark score (usually 5.0) |
| `a360_period` | text | YES | — | Assessment period label |
| `a360_sources` | jsonb | YES | `[]` | Array of score sources with percentages |
| `a360_criteria` | jsonb | YES | `[]` | Array of criteria with scores |
| `a360_strengths` | jsonb | YES | `[]` | Array of identified strengths |
| `a360_needs_dev` | jsonb | YES | `[]` | Array of development needs |
| `a360_manager_note` | text | YES | — | Manager's qualitative note |
| `training_hours` | integer | YES | `0` | Total training hours this year |
| `last_promotion_year` | integer | YES | — | Year of last promotion |
| `updated_at` | timestamptz | YES | `now()` | Last update timestamp |

**RLS Policies (after security migration):**
- `employee_extras_select` (SELECT, authenticated): `true`
- `employee_extras_write` (ALL, authenticated): `is_hr_or_admin()`

**RLS disabled in dev** via `20260424_disable_rls_dev.sql`.

---

### `idp_plans`
Individual Development Plans per employee.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `employee_id` | text | NOT NULL | — | FK → `employees.id` |
| `year` | integer | YES | — | Plan year |
| `status` | text | YES | — | `draft` / `active` / `completed` |
| `overall_progress` | integer | YES | `0` | Progress % |
| `target_position` | text | YES | — | Target role |
| `approved_by` | text | YES | — | Approver name |
| `approved_date` | date | YES | — | Approval date |
| `goals_12m` | jsonb | YES | `[]` | 12-month goal strings |
| `goals_2to3y` | jsonb | YES | `[]` | 2–3 year goal strings |

**RLS Policies (after security migration):**
- `idp_plans_select` (SELECT, authenticated): own `employee_id` OR `is_hr_or_admin()`
- `idp_plans_write` (ALL, authenticated): own `employee_id` OR `is_hr_or_admin()`

**RLS disabled in dev** via `20260424_fix_rls_and_schema.sql`.

---

### `idp_goals`
Individual goals within an IDP plan (child of `idp_plans`).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `plan_id` | uuid | NOT NULL | — | FK → `idp_plans.id` |
| `title` | text | NOT NULL | — | Goal title |
| `category` | text | YES | — | Goal category |
| `type` | text | YES | — | Goal type |
| `deadline` | date | YES | — | Target completion date |
| `status` | text | YES | — | `not_started` / `in_progress` / `completed` |
| `progress` | integer | YES | `0` | Progress % |
| `mentor` | text | YES | — | Mentor name |

---

### `approval_requests`
Approval workflow requests — top-level record for each approval submission.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `type` | text | NOT NULL | — | `idp` / `succession` / `position` / `career_roadmap` / `mentor` |
| `title` | text | NOT NULL | — | Human-readable request title |
| `description` | text | YES | — | Detailed description |
| `ref_id` | text | YES | — | FK to the referenced entity (e.g. career_roadmap id) |
| `ref_data` | jsonb | YES | — | Snapshot of referenced data at submission time |
| `requested_by_id` | text | NOT NULL | — | Supabase Auth user UUID (string form) |
| `requested_by_name` | text | YES | — | Requester display name |
| `requested_by_role` | text | YES | — | Requester role at time of submission |
| `department` | text | YES | — | Department context |
| `status` | text | NOT NULL | `'pending'` | `pending` / `approved` / `rejected` |
| `created_at` | timestamptz | YES | `now()` | Submission timestamp |
| `updated_at` | timestamptz | YES | `now()` | Last update timestamp |
| `resolved_at` | timestamptz | YES | — | When finally approved or rejected |

**RLS Policies (final state after all migrations):**
- `apr_admin_all` (SELECT, authenticated): user role = `Admin`
- `apr_hrm_all` (SELECT, authenticated): user role = `HR Manager`
- `apr_select_own` (SELECT, authenticated): `requested_by_id = auth.uid()`
- `apr_select_approver` (SELECT, authenticated): has an approval_step with `approver_id = auth.uid()`
- `apr_insert_authenticated` (INSERT, authenticated): `true` — any logged-in user
- `apr_update_authenticated` (UPDATE, authenticated): `is_hr_or_admin()` OR own request

---

### `approval_steps`
Sequential approval steps within a request. Steps are processed in `step_order` order.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `request_id` | uuid | NOT NULL | — | FK → `approval_requests.id` |
| `step_order` | integer | NOT NULL | — | Step sequence (1, 2, 3...) |
| `approver_role` | text | NOT NULL | — | `Admin` / `HR Manager` / `Line Manager` |
| `approver_id` | text | YES | — | UUID of the specific approver user |
| `approver_name` | text | YES | — | Approver display name |
| `status` | text | NOT NULL | `'pending'` | `pending` / `approved` / `rejected` |
| `note` | text | YES | — | Approver's comment |
| `acted_at` | timestamptz | YES | — | When approver took action |
| `created_at` | timestamptz | YES | `now()` | Step creation timestamp |

**RLS Policies (final state after all migrations):**
- `steps_select_hr_admin` (SELECT, authenticated): `is_hr_or_admin()`
- `steps_select_approver` (SELECT, authenticated): `approver_id = auth.uid()`
- `steps_select_all_auth` (SELECT, authenticated): `true` — replaces recursive `steps_select_requestor` to prevent circular RLS
- `steps_insert` (INSERT, authenticated): `true`
- `steps_update` (UPDATE, authenticated): `approver_id = auth.uid()` OR `is_hr_or_admin()`

**Workflow logic (sequential — implemented in `approval.service.ts`):**

| Requester Role | Steps |
|----------------|-------|
| Admin | Auto-approved (no steps) |
| HR Manager | [Admin] |
| Line Manager | [HR Manager → Admin] |
| Viewer | [Line Manager (direct) → HR Manager → Admin] |
| Mentor request (any role) | [Line Manager → HR Manager] |

---

### `audit_logs`
Audit trail for all significant actions.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `timestamp` | timestamptz | YES | `now()` | Event timestamp |
| `actor` | text | YES | — | User or system that triggered the action |
| `action` | text | YES | — | `CREATE` / `UPDATE` / `DELETE` |
| `entity` | text | YES | — | Entity type (e.g. `employee`, `succession`) |
| `entity_id` | text | YES | — | Entity ID |
| `description` | text | YES | — | Human-readable description |
| `module` | text | YES | — | Module name: `talent`, `succession`, `assessment`, `idp` |

**RLS Policies (after security migration):**
- `audit_logs_select` (SELECT, authenticated): `is_hr_or_admin()`
- `audit_logs_insert` (INSERT, authenticated): `true` — any authenticated user/Edge Function

**RLS disabled in dev** via `20260424_disable_rls_dev.sql`.

---

### `mentoring_pairs`
Mentor–mentee pairings (referenced in truncate migration, schema inferred).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `mentor_id` | text | YES | — | FK → `employees.id` |
| `mentee_id` | text | YES | — | FK → `employees.id` |
| `focus` | text | YES | — | Mentoring focus area |
| `start_date` | date | YES | — | Start date |
| `end_date` | date | YES | — | End date |
| `status` | text | YES | — | `active` / `completed` |
| `sessions_completed` | integer | YES | `0` | Sessions done |
| `sessions_total` | integer | YES | — | Total planned sessions |
| `next_session` | date | YES | — | Next scheduled session |

---

### `calibration_sessions`
Calibration sessions for 9-box placement (referenced in truncate migration, schema inferred).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `title` | text | YES | — | Session title |
| `facilitator` | text | YES | — | Facilitator name |
| `date` | date | YES | — | Session date |
| `status` | text | YES | — | `draft` / `active` / `locked` |
| `locked` | boolean | YES | `false` | Whether session is locked |
| `participants` | jsonb | YES | `[]` | Participant names |
| `calibrations` | jsonb | YES | `[]` | Calibration entries |

---

## Views

### `v_employees`
Main view used throughout the application — aggregates employee data with department and assessment scores.

**Key columns returned (based on `employee.service.ts` usage):**
- `id` — employee id (text)
- `full_name` — full name
- `position` — job title
- `department_name` — resolved department name
- `department_short` — short department name
- `department_id` — department FK
- `is_active` — active flag
- `talent_tier` — talent tier
- `potential_level` — potential level
- `performance_score` — performance score
- `potential_score` — potential score
- `risk_score` — attrition risk score
- `years_of_experience` — years of experience
- `readiness_level` — succession readiness
- `email` — email
- `hire_date` — hire date
- `tenure_years` — computed tenure
- `ktp_progress` — knowledge transfer progress
- `overall_score` — composite score
- `mentor_name` — mentor name
- `target_position` — target role
- `risk_reasons` — risk reason array
- `departure_reasons` — departure reason array
- `comp_technical`, `comp_leadership`, `comp_communication`, `comp_problem_solving`, `comp_adaptability` — competency scores
- `comp_target_technical`, `comp_target_leadership`, etc. — competency targets
- `reports_to_id` — manager FK

**Access:** SELECT granted to `authenticated` role; REVOKED from `anon`.

---

### `v_nine_box`
Nine-box grid view — maps employees to performance × potential grid positions.

**Key columns (based on service usage):**
- `id` — employee id
- `full_name` — full name
- `department_id` — department
- `department_name` — department name
- `performance_score` — x-axis value
- `potential_score` — y-axis value
- `talent_tier` — tier
- `box` — computed 9-box cell (1–9)
- `readiness_level` — readiness

**Access:** SELECT granted to `authenticated` role; REVOKED from `anon`.

---

## Functions

### `is_hr_or_admin()`
```sql
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
```
Returns `true` if `auth.uid()` maps to a user with role `HR Manager` or `Admin` in `user_profiles`. Used in RLS policies.

### `is_admin()`
```sql
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
```
Returns `true` if `auth.uid()` maps to a user with role `Admin` in `user_profiles`.

---

## Key Relationships (Entity Diagram)

```
auth.users (Supabase Auth)
    │ 1:1
    ▼
user_profiles
    │ many:1 (employee_id)
    ▼
employees ──────────────────── departments
    │  reports_to_id (self)         │
    │                               │
    ├── assessment_scores           │
    ├── assessment_summary          │
    ├── external_scores             │
    ├── career_roadmaps             │
    ├── employee_extras (1:1)       │
    ├── idp_plans                   │
    │       └── idp_goals           │
    └── succession_plans            │
              │                     │
              ▼                     │
         key_positions ─────────────┘
              │ parent_position_id (self)

approval_requests
    └── approval_steps (sequential)
```

---

## RLS Summary (Current Dev State)

After all migrations applied, the **effective dev state** has most RLS disabled for ease of development:

| Table | RLS Enabled (Dev) | Notes |
|-------|-------------------|-------|
| `user_profiles` | YES | Own-only read/update |
| `employees` | NO | Disabled for dev |
| `departments` | NO | Disabled for dev |
| `key_positions` | NO | Disabled for dev |
| `succession_plans` | NO | Disabled for dev |
| `idp_plans` | NO | Disabled for dev |
| `assessment_criteria` | NO | Disabled for dev |
| `assessment_scores` | NO | — |
| `assessment_summary` | NO | — |
| `assessment_display_config` | NO | Disabled for dev |
| `external_scores` | NO | Disabled for dev |
| `score_weight_config` | NO | Disabled for dev |
| `career_roadmaps` | NO | Disabled for dev |
| `employee_extras` | NO | Disabled for dev |
| `audit_logs` | NO | Disabled for dev |
| `approval_requests` | YES | Full RLS active |
| `approval_steps` | YES | Full RLS active |

> **Production note:** Before go-live, re-enable RLS on all tables using `20260423_security_rls.sql` as the base, then apply the approval RLS migrations. Disable-RLS migrations are DEV ONLY.
