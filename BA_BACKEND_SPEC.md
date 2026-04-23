# SuccessionOS — BA & Backend Specification

> Tài liệu này mô tả toàn bộ API, màn hình, bảng data cho BA và backend dev.
> Generated từ codebase — không chỉnh tay, regenerate khi codebase thay đổi.
> Cập nhật: 2026-04-23 | Trạng thái: ~98% frontend hoàn thành, Supabase thật đang dùng.

---

## 1. SITEMAP & ROUTES

| URL Path | Slug | Component | Mô tả màn hình | Auth required |
|---|---|---|---|---|
| `/` | root | redirect → `/dashboard` | — | Yes |
| `/login` | login | `LoginComponent` | Đăng nhập email/password + Google OAuth | No |
| `/auth/callback` | callback | `CallbackComponent` | Nhận OAuth callback (Google), lưu session | No |
| `/dashboard` | dashboard | `DashboardComponent` | Tổng quan KPI: talent counts, risk alerts, position stats | Yes |
| `/talent` | talent-list | `TalentListComponent` | Danh sách 500 nhân tài: filter, sort, search | Yes |
| `/talent/:id` | talent-profile | `TalentProfileComponent` | Hồ sơ chi tiết 1 nhân viên: assessment, IDP, radar, network | Yes |
| `/positions` | positions | `PositionsComponent` | Danh sách vị trí then chốt: CRUD, competency, auto-suggest | Yes |
| `/succession` | succession | `SuccessionComponent` | 9-Box matrix + Succession Map tree + Talent Preview drawer | Yes |
| `/idp` | idp | `IdpComponent` | Danh sách IDP: filter, create, edit, approval workflow | Yes |
| `/assessment` | assessment | `AssessmentComponent` | 360° scoring interface theo cycle | Yes |
| `/mentoring` | mentoring | `MentoringComponent` | Cặp kèm cặp + Logbook | Yes |
| `/calibration` | calibration | `CalibrationComponent` | Phiên họp calibration: create, lock, export | Yes |
| `/reports` | reports | `ReportsComponent` | Báo cáo thống kê (chưa kích hoạt) | Yes |
| `/marketplace` | marketplace | `MarketplaceComponent` | Module marketplace: enable/disable modules | Yes |
| `/admin` | admin | `AdminComponent` | Admin dashboard: entities, users, settings, audit log | Yes |
| `/profile` | profile | `ProfileComponent` | Trang cá nhân (coming soon placeholder) | Yes |
| `/settings` | settings | `SettingsComponent` | Cài đặt (coming soon placeholder) | Yes |

**Auth guard:** `authGuard` bảo vệ tất cả route con bên trong Shell. Redirect về `/login` khi chưa đăng nhập.

---

## 2. API ENDPOINTS — THEO MÀN HÌNH

### Dashboard — `/dashboard`

**Mô tả:** Màn hình tổng quan KPI, hiện 5 count metrics (talent tiers, high risk), danh sách top 3 risk alerts, và position stats.

**API calls (Supabase trực tiếp — không qua REST endpoint):**

| Method | Table/View | Params | Response fields | Dùng để làm gì trong UI |
|---|---|---|---|---|
| SELECT count | `v_employees` | `is_active=true` | `count` | Tổng nhân tài |
| SELECT count | `v_employees` | `is_active=true, talent_tier='Nòng cốt'` | `count` | KPI tile "Nòng cốt" |
| SELECT count | `v_employees` | `is_active=true, talent_tier='Tiềm năng'` | `count` | KPI tile "Tiềm năng" |
| SELECT count | `v_employees` | `is_active=true, talent_tier='Kế thừa'` | `count` | KPI tile "Kế thừa" |
| SELECT count | `v_employees` | `is_active=true, risk_score>=60` | `count` | KPI tile "Nguy cơ cao" |
| SELECT | `v_employees` | `is_active=true, risk_score>=60, order by risk_score desc, limit 3` | `id, full_name, position, department_name, risk_score, risk_reasons` | Danh sách Risk Alerts |
| SELECT count | `key_positions` | `is_active=true` | `count` | Tổng key positions |
| SELECT count | `key_positions` | `is_active=true, critical_level='Critical'` | `count` | Vị trí Critical |
| SELECT count | `key_positions` | `is_active=true, risk_level='High'` | `count` | Vị trí High Risk |
| SELECT count | `key_positions` | `is_active=true, successor_count=0` | `count` | Vị trí không có kế thừa |
| SELECT count | `key_positions` | `is_active=true, successor_count>0` | `count` | Vị trí có kế thừa |

**Bảng Supabase:**

| Table/View | Thao tác | Điều kiện filter |
|---|---|---|
| `v_employees` | SELECT count × 5 | `is_active=true`, `talent_tier`, `risk_score>=60` |
| `key_positions` | SELECT count × 5 | `is_active=true`, `critical_level`, `risk_level`, `successor_count` |

**Lưu ý cho BA:**
- 5 count queries và position queries chạy song song (Promise.all) — không block nhau
- `unassignedCount` được tính client-side: `max(1, round(total * 0.12))` — đây là ước tính, chưa có bảng thực
- Donut chart tier breakdown tính `pct` client-side từ các count trên
- IDP KPIs (`activeIdpGoalsCount`, `avgIdpProgress`) hiện là placeholder = 0, chờ fix RLS `idp_plans`

**Lưu ý cho Backend Dev:**
- View `v_employees` phải có cột `is_active`, `talent_tier`, `risk_score`, `risk_reasons`, `department_name`
- Table `key_positions` phải có cột `is_active`, `critical_level`, `risk_level`, `successor_count`
- `successor_count` nên là computed column hoặc được cập nhật bởi trigger khi `succession_plans` thay đổi

---

### Talent List — `/talent`

**Mô tả:** Bảng danh sách toàn bộ nhân tài (500 employees). Hỗ trợ search, filter theo tier/dept/readiness/risk, sort theo 5 trường.

**API calls:**

| Method | Table/View | Params | Response fields | Dùng để làm gì trong UI |
|---|---|---|---|---|
| SELECT | `v_employees` | `is_active=true`, optional `department_id`, `talent_tier`, `limit` | `*` (toàn bộ fields) | Render bảng nhân tài |

**Bảng Supabase:**

| Table/View | Thao tác | Điều kiện filter |
|---|---|---|
| `v_employees` | SELECT | `is_active=true`, optional department/tier filter |

**Lưu ý cho BA:**
- Filter hoạt động client-side sau khi load toàn bộ data (không paginate server-side hiện tại)
- `overallScore` = `round((performance_score + potential_score) / 2)` — tính client-side
- `competencyGap` = `avg(max(0, target[k] - actual[k]))` trên 5 trục — tính client-side
- Readiness labels: `Ready Now` → "Sẵn sàng ngay", `Ready in 1 Year` → "1-2 năm", `Ready in 2 Years` → "3-5 năm"
- Risk band: `score>=60` = High, `30-59` = Med, `<30` = Low
- **TODO trong code:** positions fetch cho "held position" và "successor of" chờ fix RLS `key_positions`
- `departure_reasons` lấy từ `v_employees.departure_reasons`, hoặc suy ra: `risk_score>=60 & years>=20` → "Sắp nghỉ hưu"

**Lưu ý cho Backend Dev:**
- View `v_employees` cần: `id, full_name, position, department_name, department_id, talent_tier, potential_level, performance_score, potential_score, risk_score, years_of_experience, readiness_level, email, hire_date, tenure_years, ktp_progress, overall_score, mentor_name, target_position, risk_reasons, departure_reasons, comp_technical, comp_leadership, comp_communication, comp_problem_solving, comp_adaptability, comp_target_technical, comp_target_leadership, comp_target_communication, comp_target_problem_solving, comp_target_adaptability, is_active`
- Cân nhắc server-side pagination cho production (500 rows hiện tại OK, nhưng sẽ scale)

---

### Talent Profile — `/talent/:id`

**Mô tả:** Hồ sơ chi tiết 1 nhân viên gồm: hero card, tabs (Tổng quan, IDP, Đánh giá, Kế thừa), radar chart năng lực, mạng lưới phát triển, risk factors, mentor picker.

**API calls:**

| Method | Table/View | Params | Response fields | Dùng để làm gì trong UI |
|---|---|---|---|---|
| SELECT | `v_employees` | `id = :id` | `*` | Hero card, competency scores, risk score |
| SELECT | `v_employees` | `is_active=true` | `*` | Mentor picker — danh sách ứng viên mentor |
| SELECT | `assessment_cycles` | `order by sort_order desc` | `id, name, type, start_date, end_date, status` | Dropdown chọn cycle |
| SELECT | `assessment_scores` | `employee_id=:id, cycle_id=:cycleId` | `criterion_id, score` | Radar chart + điểm từng tiêu chí |
| SELECT | `assessment_summary` | `employee_id=:id, cycle_id=:cycleId` | `overall_score, rating_label, manager_note, strengths[], needs_dev[]` | Card đánh giá năng lực |
| SELECT | `assessment_criteria` | `is_active=true, order by sort_order` | `id, key, label, description, weight` | Tên tiêu chí cho radar |
| SELECT | `assessment_display_config` | `id=1` | `criterion_ids` | Chọn 4 tiêu chí hiển thị |
| SELECT | `idp_plans` | `employee_id=:id, order year desc, limit 1` | `*, goals:idp_goals(*)` | Tab IDP: trạng thái, goals, target position |
| SELECT | `succession_plans` | `talent_id=:id, order priority` | `position_id, readiness, priority` | Xem talent là kế thừa cho vị trí nào |
| SELECT | `key_positions` | `id=plan.position_id` | `title` | Tên vị trí mà talent kế thừa |
| SELECT | `key_positions` | `current_holder_id=:id, limit 1` | `id` | Tìm vị trí mà talent đang giữ |
| SELECT | `succession_plans` | `position_id=:positionId, order priority` | `talent_id, readiness, priority` | Lấy danh sách kế thừa cho người giữ vị trí |
| SELECT | `idp_plans` | `employee_id IN (ids), status='Active'` | `employee_id, overall_progress` | IDP progress của từng successor trong network |

**Bảng Supabase:**

| Table/View | Thao tác | Điều kiện filter |
|---|---|---|
| `v_employees` | SELECT (×2) | `id=:id` + `is_active=true` |
| `assessment_cycles` | SELECT | `order sort_order desc` |
| `assessment_scores` | SELECT | `employee_id`, `cycle_id` |
| `assessment_summary` | SELECT | `employee_id`, `cycle_id` |
| `assessment_criteria` | SELECT | `is_active=true` |
| `assessment_display_config` | SELECT | `id=1` |
| `idp_plans` | SELECT (nested join) | `employee_id=:id` |
| `idp_goals` | SELECT (nested) | `idp_plan_id` |
| `succession_plans` | SELECT (×3) | `talent_id=:id`, `position_id=:positionId` |
| `key_positions` | SELECT (×2) | `id=:id`, `current_holder_id=:id` |

**Lưu ý cho BA:**
- Màn hình load song song nhiều queries để tối ưu tốc độ
- Radar chart 5 trục: `Kỹ thuật` (technical), `Hiệu suất` (problem_solving), `Hành vi` (communication), `Tiềm năng` (adaptability), `Lãnh đạo` (leadership)
- Radar ưu tiên data từ `assessment_scores` × cycle đã chọn, fallback về `v_employees.comp_*` khi chưa có assessment
- **TODO trong code (chưa implement):** `getNetwork()` — mạng lưới theo `mentor_id chain + department peers`
- **TODO trong code (chưa implement):** `getRiskFactors()` — qua `risk_factors` table chưa tồn tại
- **TODO trong code:** `PATCH /employees/:id/mentor` — nút gán mentor chỉ update local state, chưa gọi API
- **TODO trong code:** `/employees/:id/stats` — `trainingHours` và `lastPromotion` hardcode tạm
- `careerReview`, `currentProject`, `knowledgeTransfer` sections hiện dùng DEFAULT fallback (mock data hardcode trong component), chưa wire backend
- Timeline hoạt động tĩnh (hardcode), chưa fetch từ backend
- Cycle "closed" gần nhất được chọn mặc định; user có thể đổi dropdown

**Lưu ý cho Backend Dev:**
- `v_employees` cần: `comp_target_technical, comp_target_leadership, comp_target_communication, comp_target_problem_solving, comp_target_adaptability`
- `assessment_scores` PK composite: `(employee_id, cycle_id, criterion_id)`
- `assessment_summary` PK composite: `(employee_id, cycle_id)`
- `assessment_display_config` là singleton row `id=1`, field `criterion_ids uuid[]`
- Cần implement API: `GET /employees/:id/career-review`, `GET /employees/:id/current-project`, `GET /employees/:id/knowledge-transfer`
- Cần implement: `PATCH /employees/:id/mentor` + `DELETE /employees/:id/mentor`
- Table `risk_factors` chưa có trong schema — cần thiết kế nếu muốn dữ liệu động

---

### Key Positions — `/positions`

**Mô tả:** Danh sách vị trí then chốt. CRUD vị trí, quản lý required competencies (drag-drop), xem successors, auto-suggest từ talent pool.

**API calls:**

| Method | Table/View | Params | Response fields | Dùng để làm gì trong UI |
|---|---|---|---|---|
| SELECT | `key_positions` | `is_active=true` | `*` | Danh sách vị trí |
| SELECT | `departments` | (all) | `id, name` | Join department name |
| SELECT | `v_employees` | (all) | `id, full_name` | Join current_holder name |
| SELECT | `succession_plans` | `position_id=:id, order priority` | `*` | Successors của mỗi vị trí |
| INSERT | `key_positions` | payload | `*` | Tạo vị trí mới |
| UPDATE | `key_positions` | `id=:id`, payload | `*` | Cập nhật vị trí |
| DELETE | `key_positions` | `id=:id` | — | Xóa vị trí |
| SELECT count | `key_positions` | (all) | count | Summary banner |
| SELECT count | `key_positions` | `critical_level='Critical'` | count | Summary banner |
| SELECT count | `key_positions` | `successor_count=0` | count | Summary banner |

**Bảng Supabase:**

| Table/View | Thao tác | Điều kiện filter |
|---|---|---|
| `key_positions` | SELECT, INSERT, UPDATE, DELETE | `is_active=true`, `id` |
| `departments` | SELECT | — |
| `v_employees` | SELECT | — |
| `succession_plans` | SELECT | `position_id=:id` |

**Lưu ý cho BA:**
- `required_competencies` là `string[]` — danh sách tên năng lực, UI cho phép drag-drop sắp xếp
- `successor_count` và `ready_now_count` được lưu trực tiếp trên `key_positions` (không join real-time) — cần trigger update khi succession_plans thay đổi
- Auto-suggest holders: tìm talent trong `v_employees` match competencies của vị trí
- `criticality_score` và `dependency_score` là formulas, xem mục 5

**Lưu ý cho Backend Dev:**
- Khi INSERT/UPDATE succession_plans → trigger cập nhật `key_positions.successor_count` và `ready_now_count`
- `parent_position_id` dùng cho org tree hierarchy trong `/succession`
- RLS: chỉ Admin/HR Manager được tạo/sửa/xóa vị trí

---

### Succession — `/succession`

**Mô tả:** 2 tab: (1) 9-Box Matrix — phân bổ talent theo performance × potential. (2) Succession Map — org tree hierarchy, xem kế thừa, thêm/xóa successor.

**API calls:**

| Method | Table/View | Params | Response fields | Dùng để làm gì trong UI |
|---|---|---|---|---|
| SELECT | `v_nine_box` | (all) | `id, full_name, performance_score, potential_score, department_id, talent_tier, risk_band, box` | 9-Box chips |
| SELECT | `succession_plans` | `order priority` | `*` | Succession Map: successor list per position |
| SELECT | `key_positions` | `is_active=true` | `*` | Succession Map: nodes của org tree |
| SELECT | `departments` | (all) | `id, name` | Join department name cho positions |
| SELECT | `v_employees` | (all) | `id, full_name` | Join tên người giữ vị trí + tên successor |
| UPSERT | `succession_plans` | `{position_id, talent_id, readiness, priority, gap_score}` | `*` | Thêm successor vào vị trí |
| DELETE | `succession_plans` | `id=:id` | — | Xóa successor |

**Bảng Supabase:**

| Table/View | Thao tác | Điều kiện filter |
|---|---|---|
| `v_nine_box` | SELECT | — |
| `succession_plans` | SELECT, UPSERT, DELETE | `position_id`, `talent_id`, `onConflict: position_id,talent_id` |
| `key_positions` | SELECT | `is_active=true` |
| `departments` | SELECT | — |
| `v_employees` | SELECT | — |

**Lưu ý cho BA:**
- **9-Box**: cột `box` (1-9) được compute sẵn trong view `v_nine_box`, không cần tính lại ở frontend
- Thresholds Performance/Potential mặc định `[70, 85]` — user có thể chỉnh trong UI (local, không save server)
- Box labels: 9="Ngôi sao tương lai", 8="Nhân tài nổi bật", 7="Ngôi sao tiềm ẩn", 6="Lãnh đạo tiềm năng", 5="Nhân tài cốt lõi", 4="Nhân viên vững", 3="Enigma", 2="Tiềm năng ẩn", 1="Cần cải thiện"
- **Succession Map**: dùng `parent_position_id` để build org tree
- **Role-based view**: `Line Manager` chỉ thấy positions thuộc department mình + positions mà talent mình là successor
- Talent Preview Drawer: click talent chip → mở drawer embed TalentProfileComponent, URL sync `/talent/:id`
- UPSERT succession_plans dùng `onConflict: 'position_id,talent_id'` — unique constraint bắt buộc

**Lưu ý cho Backend Dev:**
- View `v_nine_box` cần cột `box int` (1-9) computed từ performance/potential tiers
- `succession_plans` cần unique constraint `(position_id, talent_id)`
- RLS: `Line Manager` chỉ đọc positions thuộc department của họ

---

### IDP — `/idp`

**Mô tả:** Danh sách kế hoạch phát triển cá nhân. Filter theo status. Tạo/edit IDP với goals. Approval workflow 3 cấp.

**API calls:**

| Method | Table/View | Params | Response fields | Dùng để làm gì trong UI |
|---|---|---|---|---|
| SELECT | `idp_plans` | optional `status`, `employee_id` | `*, goals:idp_goals(*)` | Danh sách IDP + goals |
| SELECT | `v_employees` | `id IN (employee_ids)` | `id, full_name` | Join tên nhân viên |
| INSERT | `idp_plans` | payload | `*` | Tạo IDP mới |
| UPDATE | `idp_plans` | `id=:id`, payload | `*` | Cập nhật IDP |
| INSERT | `idp_goals` | `{...goal, idp_plan_id}` | `*` | Thêm goal vào IDP |
| UPDATE | `idp_goals` | `id=:id`, payload | `*` | Cập nhật goal |

**Bảng Supabase:**

| Table/View | Thao tác | Điều kiện filter |
|---|---|---|
| `idp_plans` | SELECT, INSERT, UPDATE | `status`, `employee_id` |
| `idp_goals` | SELECT (nested), INSERT, UPDATE | `idp_plan_id` |
| `v_employees` | SELECT | `id IN (...)` |

**Lưu ý cho BA:**
- Approval workflow 3 bước: Quản lý trực tiếp → Phòng Nhân sự → Ban Giám đốc
- **TODO trong code:** approval thực tế chỉ update local state, chưa PATCH backend — cần: `PATCH /idp/:id/approve?step=1|2|3`
- IDP status flow: `Draft` → `Pending Review` → `Approved` → `Active` → `Completed`
- `overall_progress` = avg(goal.progress) của các goals có status != "Not Started"
- Goal types: Training, Stretch, Rotation, Mentoring
- Goal status: Not Started, In Progress, Completed
- "At Risk Goal": `deadline < today + 14d AND progress < 50%`
- `approved_by` resolve từ chuỗi: `approved_by_l3_id ?? approved_by_l2_id ?? approved_by_l1_id`
- IDP đã `Completed` không sửa lại — tạo IDP mới cho năm tiếp theo

**Lưu ý cho Backend Dev:**
- `idp_plans` columns cần: `id, employee_id, year, status, overall_progress, target_position, approved_by_l1_id, approved_by_l2_id, approved_by_l3_id, approved_by_l1_at, approved_by_l2_at, approved_by_l3_at`
- `idp_goals` columns cần: `id, idp_plan_id, title, type, category, deadline, status, progress, mentor`
- Cần implement: `PATCH /idp/:id/approve` với body `{step: 1|2|3, approver_id, note}`
- RLS: employee chỉ xem IDP của chính họ; HR Manager xem tất cả; Line Manager xem team

---

### Assessment — `/assessment`

**Mô tả:** 360° assessment scoring interface theo cycle. Nhập điểm từng tiêu chí cho employee.

**API calls:**

| Method | Table/View | Params | Response fields | Dùng để làm gì trong UI |
|---|---|---|---|---|
| SELECT | `assessment_cycles` | `order sort_order desc` | `id, name, type, start_date, end_date, status` | Dropdown chọn cycle |
| SELECT | `assessment_criteria` | `is_active=true, order sort_order` | `id, key, label, description, weight, category` | Form nhập điểm |

**Bảng Supabase:**

| Table/View | Thao tác | Điều kiện filter |
|---|---|---|
| `assessment_cycles` | SELECT | `order sort_order desc` |
| `assessment_criteria` | SELECT | `is_active=true` |

**Lưu ý cho BA:**
- Module này là giao diện nhập điểm; xem kết quả ở Talent Profile tab "Đánh giá"
- Thang điểm: 1.0 – 5.0, step 0.01 (theo config admin)
- Người đánh giá: Quản lý (QL) 50% · Đồng nghiệp (ĐN) 30% · Cấp dưới (CĐ) 20%
- ĐN/CĐ luôn ẩn danh (chỉ HR thấy raw data)
- Số rater tối thiểu: ≥1 QL + ≥3 ĐN + ≥2 CĐ

**Lưu ý cho Backend Dev:**
- Cần implement API để nhập scores: `POST /assessment-scores` với `{employee_id, cycle_id, criterion_id, score, rater_id, rater_type}`
- Formula overall: `(avg(QL) × 0.5) + (avg(ĐN) × 0.3) + (avg(CĐ) × 0.2)`
- Sau khi đủ raters → trigger tính toán và ghi `assessment_summary`

---

### Mentoring — `/mentoring`

**Mô tả:** Danh sách cặp kèm cặp (mentor × mentee). Tạo cặp mới, xem logbook, ghi log từng buổi gặp.

**API calls:**

| Method | Table/View | Params | Response fields | Dùng để làm gì trong UI |
|---|---|---|---|---|
| GET (mock) | `ApiService` | `mentoring-pairs` → stub | `data: MentoringPair[]` | Danh sách cặp |

> **Lưu ý:** Module này dùng `ApiService` stub (deprecated) — tất cả data từ mock file `mentoring-pairs.json`. Chưa wire Supabase.

**Bảng Supabase cần tạo:**

| Table | Columns cần có | Relations |
|---|---|---|
| `mentoring_pairs` | `id, mentor_id, mentee_id, focus, start_date, end_date, status, sessions_completed, sessions_total, next_session` | FK → `employees.id` |
| `mentoring_sessions` | `id, pair_id, date, summary, next_action` | FK → `mentoring_pairs.id` |

**Lưu ý cho BA:**
- Logbook sessions hiện hardcode trong component (`PAIR_SESSIONS` dict) — cần bảng `mentoring_sessions`
- Mentor phải có ≥8 năm kinh nghiệm, tier Nòng cốt/Kế thừa, không cùng line mentee
- Mỗi mentor không có quá 5 mentees active
- Bắt buộc log sau mỗi session — quá 14 ngày không log → hệ thống nhắc
- **Module chưa implement:** `submitPair()` chỉ update local state, chưa gọi API

**Lưu ý cho Backend Dev:**
- Cần implement: `GET /mentoring-pairs`, `POST /mentoring-pairs`, `POST /mentoring-pairs/:id/sessions`
- Migrate từ mock `mentoring-pairs.json` sang Supabase table
- `effectiveness = (sessions_completed / sessions_total) × (menteeProgress / 100)`

---

### Calibration — `/calibration`

**Mô tả:** Quản lý phiên họp calibration: tạo phiên, lock sau khi hoàn thành, export kết quả.

**API calls:**

| Method | Table/View | Params | Response fields | Dùng để làm gì trong UI |
|---|---|---|---|---|
| GET (mock) | `ApiService` | `calibration-sessions` → stub | `data: CalibrationSession[]` | Danh sách phiên |

> **Lưu ý:** Module dùng `ApiService` stub — data từ mock `calibration-sessions.json`. Chưa wire Supabase.

**Bảng Supabase cần tạo:**

| Table | Columns cần có | Relations |
|---|---|---|
| `calibration_sessions` | `id, title, facilitator, date, status, locked, participants text[]` | — |
| `calibration_entries` | `id, session_id, talent_id, performance_before, performance_after, potential_before, potential_after, box_before, box_after, notes` | FK → `calibration_sessions.id`, `employees.id` |

**Lưu ý cho BA:**
- Session cần ≥3 participants + ≥1 HR để hợp lệ
- Sau khi Lock → không sửa được; chỉ HR Admin mới unlock
- Score thay đổi >15 điểm cần ghi justification note
- **TODO trong code:** `submitSession()`, `lockSession()`, `exportSession()` đều chỉ update local state
- `box_move = boxAfter − boxBefore` (âm = tụt hạng, dương = thăng hạng)

**Lưu ý cho Backend Dev:**
- Cần implement: `GET/POST /calibration-sessions`, `PATCH /calibration-sessions/:id/lock`, `GET /calibration-sessions/:id/export`
- Export format: Excel (.xlsx) theo config admin

---

### Admin — `/admin`

**Mô tả:** Dashboard quản trị 6 tabs: Overview (stats), Data (CRUD entities), Users (quản lý user), Settings (module config + assessment criteria), Audit (log), Assessment config (drag-drop 4 tiêu chí).

**API calls:**

| Method | Table/View | Params | Response fields | Dùng để làm gì trong UI |
|---|---|---|---|---|
| SELECT | `v_employees` | `is_active=true` | `*` | Stats: tổng nhân viên |
| SELECT | `audit_logs` | `order timestamp desc, limit 100` | `*` | Audit log tab |
| SELECT | `assessment_criteria` | `is_active=true, order sort_order` | `id, key, label, description, weight` | Drag-drop criteria config |
| SELECT | `assessment_display_config` | `id=1` | `criterion_ids` | Load 4 tiêu chí đang hiển thị |
| UPSERT | `assessment_display_config` | `{id:1, criterion_ids: uuid[]}` | — | Lưu cấu hình 4 tiêu chí |
| POST (mock) | `employees/sync` | `{}` | `{message, syncedAt}` | VnR Sync |

**Bảng Supabase:**

| Table/View | Thao tác | Điều kiện filter |
|---|---|---|
| `v_employees` | SELECT | `is_active=true` |
| `audit_logs` | SELECT | `order timestamp desc` |
| `assessment_criteria` | SELECT | `is_active=true` |
| `assessment_display_config` | SELECT, UPSERT | `id=1` |

**Lưu ý cho BA:**
- **Tab Users**: hiện dùng 6 users hardcode (static, không fetch từ DB) — cần migrate sang `user_profiles` table
- **Tab Data**: CRUD entities chỉ update local state (in-memory), không gọi backend — cần wire API
- **Module Config**: hardcode trong component `moduleConfigs` — cần endpoint `GET/PUT /admin/modules/:key/config`
- **VnR Sync**: gọi deprecated `ApiService` stub → mock success — cần implement real sync endpoint
- Chỉ Admin được phép lưu `assessment_display_config`

**Lưu ý cho Backend Dev:**
- Cần bảng `audit_logs`: `id, timestamp, actor, action, entity, entity_id, description, module`
- Cần bảng `user_profiles`: `id, username, full_name, email, role (Admin|HR Manager|Line Manager|Viewer), status, last_login`
- Cần implement: `POST /employees/sync` (VnR data sync)
- RBAC check: `isAdmin()` dựa vào `user_profiles.role`

---

### Reports — `/reports`

**Mô tả:** Placeholder báo cáo thống kê. Hiện chưa kích hoạt (module `enabled: false` trong admin).

**API calls:** Dùng `ApiService` stub — không có real queries. Cần implement khi module kích hoạt.

**Lưu ý cho BA:**
- Export formats theo config: Excel (.xlsx), PDF (A4)
- Phân quyền: Admin/HR full, Line Manager chỉ team, Viewer read-only
- Mỗi lần export ghi audit log

---

## 3. DATA MODELS — TOÀN BỘ INTERFACES

### Enums & Literal Types

| Type | Giá trị | Mô tả |
|---|---|---|
| `TalentTier` | `'Nòng cốt' \| 'Tiềm năng' \| 'Kế thừa'` | Phân tầng nhân tài |
| `ReadinessLevel` | `'Ready Now' \| 'Ready in 1 Year' \| 'Ready in 2 Years'` | Mức độ sẵn sàng kế thừa |
| `PotentialLevel` | `'Very High' \| 'High' \| 'Medium' \| 'Low'` | Mức độ tiềm năng |
| `RiskLevel` | `'High' \| 'Medium' \| 'Low'` | Mức độ rủi ro |
| `CriticalLevel` | `'Critical' \| 'High' \| 'Medium' \| 'Low'` | Mức độ quan trọng vị trí |

### Talent (Employee)

| Field | Kiểu | Bắt buộc | Nguồn | Mô tả |
|---|---|---|---|---|
| `id` | `string` | ✅ | DB | Employee ID (e.g. "E001") |
| `full_name` | `string` | ✅ | DB | Họ tên đầy đủ |
| `position` | `string` | ✅ | DB | Tên chức danh |
| `department` | `string` | ✅ | DB | Tên phòng ban (từ view join) |
| `department_id` | `string` | ❌ | DB | FK → departments |
| `talent_tier` | `TalentTier` | ✅ | DB | Phân tầng nhân tài |
| `potential_level` | `PotentialLevel` | ✅ | DB | Mức tiềm năng |
| `performance_score` | `number \| null` | ❌ | DB | Điểm hiệu suất (0-100) |
| `potential_score` | `number \| null` | ❌ | DB | Điểm tiềm năng (0-100) |
| `risk_score` | `number \| null` | ❌ | DB | Điểm rủi ro (0-100) |
| `years_of_experience` | `number` | ✅ | DB | Số năm kinh nghiệm |
| `readiness_level` | `ReadinessLevel` | ✅ | DB | Mức độ sẵn sàng kế thừa |
| `email` | `string` | ✅ | DB | Email |
| `hire_date` | `string` | ❌ | DB | Ngày vào làm (YYYY-MM-DD) |
| `tenure_years` | `number` | ❌ | DB | Số năm làm việc |
| `ktp_progress` | `number` | ❌ | DB | % tiến độ Knowledge Transfer Plan |
| `overall_score` | `number` | ❌ | DB | Điểm tổng hợp (nếu có) |
| `mentor` | `string \| null` | ❌ | DB | Tên mentor |
| `target_position` | `string` | ❌ | DB | Vị trí mục tiêu phát triển |
| `risk_reasons` | `string[]` | ❌ | DB | Danh sách lý do rủi ro |
| `risk_factors` | `RiskFactor[]` | ❌ | computed | Chi tiết yếu tố rủi ro (suy ra client-side nếu không có) |
| `departure_reasons` | `string[]` | ❌ | DB | Lý do có thể rời đi |
| `competencies` | `object` | ❌ | DB | `{technical, leadership, communication, problem_solving, adaptability}` (0-100) |
| `competency_targets` | `object` | ❌ | DB | `{technical, performance, behavior, potential, leadership}` (ngưỡng chuẩn) |

### RiskFactor

| Field | Kiểu | Mô tả |
|---|---|---|
| `title` | `string` | Tiêu đề yếu tố rủi ro |
| `detail` | `string` | Mô tả chi tiết |
| `severity` | `'high' \| 'medium' \| 'low'` | Mức độ nghiêm trọng |
| `source` | `string` | Nguồn phát hiện (HR / Tự động) |
| `date` | `string` | Thời điểm ghi nhận |

### KeyPosition

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `id` | `string` | ✅ | ID vị trí |
| `title` | `string` | ✅ | Tên vị trí |
| `department` | `string` | ✅ | Tên phòng ban (view join) |
| `current_holder` | `string` | ✅ | Tên người đang giữ (view join) |
| `successor_count` | `number` | ✅ | Số ứng viên kế thừa |
| `ready_now_count` | `number` | ✅ | Số ứng viên Ready Now |
| `risk_level` | `RiskLevel` | ✅ | Mức rủi ro vị trí |
| `critical_level` | `CriticalLevel` | ✅ | Mức độ quan trọng |
| `successors` | `string[]` | ✅ | Danh sách talent_id kế thừa |
| `required_competencies` | `string[]` | ✅ | Năng lực yêu cầu |
| `parent_id` | `string \| null` | ❌ | FK → key_positions (org tree) |

### Successor

| Field | Kiểu | Mô tả |
|---|---|---|
| `talent_id` | `string` | FK → employees |
| `talent_name` | `string` | Tên (view join) |
| `readiness` | `ReadinessLevel` | Mức sẵn sàng |
| `priority` | `number` | Thứ tự ưu tiên (1 = ưu tiên nhất) |
| `gap_score` | `number` | Điểm GAP năng lực (0 = không GAP) |

### SuccessionPlan

| Field | Kiểu | Mô tả |
|---|---|---|
| `id` | `string` | ID (= position_id) |
| `position_id` | `string` | FK → key_positions |
| `position_title` | `string` | Tên vị trí |
| `department` | `string` | Tên phòng ban |
| `successors` | `Successor[]` | Danh sách kế thừa |

### IdpGoal

| Field | Kiểu | Mô tả |
|---|---|---|
| `id` | `string` | ID goal |
| `title` | `string` | Tên mục tiêu |
| `category` | `string` | Loại (Training/Stretch/Rotation/Mentoring) |
| `type` | `string` | Giống category |
| `deadline` | `string` | Hạn chót (YYYY-MM-DD) |
| `status` | `string` | Not Started / In Progress / Completed |
| `progress` | `number` | % hoàn thành (0-100) |
| `mentor` | `string \| null` | Tên mentor nếu có |

### IdpPlan

| Field | Kiểu | Mô tả |
|---|---|---|
| `id` | `string` | ID kế hoạch |
| `talent_id` | `string` | FK → employees |
| `talent_name` | `string` | Tên nhân viên |
| `year` | `number` | Năm kế hoạch |
| `status` | `string` | Draft / Pending / Active / Completed |
| `overall_progress` | `number` | % tiến độ tổng |
| `goals` | `IdpGoal[]` | Danh sách mục tiêu |
| `target_position` | `string` | Vị trí mục tiêu |
| `approved_by` | `string` | Tên người duyệt |
| `approved_date` | `string` | Ngày duyệt |
| `goals_12m` | `string[]` | Goals ngắn hạn (placeholder) |
| `goals_2to3y` | `string[]` | Goals dài hạn (placeholder) |

### Assessment-related (từ assessment.service.ts)

**Cycle:**

| Field | Kiểu | Mô tả |
|---|---|---|
| `id` | `string` | Cycle ID |
| `name` | `string` | Tên chu kỳ (e.g. "Chu kỳ 2024 Annual") |
| `type` | `string` | Annual / Q4 / Mid-year / Q1 |
| `start_date` | `string \| null` | Ngày bắt đầu |
| `end_date` | `string \| null` | Ngày kết thúc |
| `status` | `string` | open / closed / locked |

**Criterion:**

| Field | Kiểu | Mô tả |
|---|---|---|
| `id` | `string` | Criterion ID |
| `key` | `string` | Khoá định danh (technical, performance, ...) |
| `label` | `string` | Tên hiển thị |
| `description` | `string \| null` | Mô tả chi tiết |
| `weight` | `number` | Trọng số |
| `category` | `string \| null` | Nhóm tiêu chí |
| `sort_order` | `number` | Thứ tự hiển thị |
| `is_active` | `boolean` | Đang dùng hay không |

**AssessmentView** (kết quả đánh giá cho 1 employee × 1 cycle):

| Field | Kiểu | Mô tả |
|---|---|---|
| `employee_id` | `string` | FK → employees |
| `cycle_id` | `string` | FK → assessment_cycles |
| `overall_score` | `number \| null` | Điểm tổng hợp |
| `rating_label` | `string \| null` | Nhãn xếp loại (Xuất sắc/Tốt/...) |
| `manager_note` | `string \| null` | Nhận xét quản lý |
| `strengths` | `string[]` | Điểm mạnh |
| `needs_dev` | `string[]` | Cần phát triển |
| `items` | `Array<Criterion & {score}>` | 4 tiêu chí được chọn kèm điểm |

**RadarEntry** (1 trục trong radar chart):

| Field | Kiểu | Mô tả |
|---|---|---|
| `key` | `string` | technical / performance / behavior / potential / leadership |
| `label` | `string` | Kỹ thuật / Hiệu suất / Hành vi / Tiềm năng / Lãnh đạo |
| `actual` | `number \| null` | Điểm thực tế (từ assessment_scores) |
| `target` | `number` | Ngưỡng chuẩn (từ v_employees.comp_target_*) |
| `delta` | `number \| null` | actual - target (>=0 = vượt chuẩn) |

### MentoringPair

| Field | Kiểu | Mô tả |
|---|---|---|
| `id` | `string` | Pair ID |
| `mentor_id` | `string` | FK → employees |
| `mentor_name` | `string` | Tên mentor |
| `mentee_id` | `string` | FK → employees |
| `mentee_name` | `string` | Tên mentee |
| `focus` | `string` | Lĩnh vực phát triển |
| `start_date` | `string` | Ngày bắt đầu |
| `end_date` | `string` | Ngày kết thúc |
| `status` | `string` | Active / Completed |
| `sessions_completed` | `number` | Số buổi đã thực hiện |
| `sessions_total` | `number` | Tổng số buổi theo kế hoạch |
| `next_session` | `string \| null` | Ngày buổi tiếp theo |

### CalibrationSession

| Field | Kiểu | Mô tả |
|---|---|---|
| `id` | `string` | Session ID |
| `title` | `string` | Tên phiên họp |
| `facilitator` | `string` | Người chủ trì |
| `date` | `string` | Ngày tổ chức |
| `status` | `string` | Draft / Completed |
| `locked` | `boolean` | Đã lock chưa |
| `participants` | `string[]` | Danh sách participants |
| `calibrations` | `CalibrationEntry[]` | Kết quả điều chỉnh |

### CalibrationEntry

| Field | Kiểu | Mô tả |
|---|---|---|
| `talent_id` | `string` | FK → employees |
| `performance_before` | `number` | Điểm hiệu suất trước |
| `performance_after` | `number` | Điểm hiệu suất sau |
| `potential_before` | `number` | Điểm tiềm năng trước |
| `potential_after` | `number` | Điểm tiềm năng sau |
| `box` | `number` | Box 9-Matrix (1-9) |
| `notes` | `string` | Ghi chú justification |

### AuditLog

| Field | Kiểu | Mô tả |
|---|---|---|
| `id` | `string` | Log ID |
| `timestamp` | `string` | ISO timestamp |
| `actor` | `string` | Người thực hiện |
| `action` | `string` | UPDATE / CREATE / DELETE / LOCK / IMPORT |
| `entity` | `string` | Tên entity (employees, idp_plans, ...) |
| `entity_id` | `string \| null` | ID entity bị tác động |
| `description` | `string` | Mô tả hành động |
| `module` | `string` | Module thực hiện |

### DashboardKpi

| Field | Kiểu | Mô tả |
|---|---|---|
| `total_talents` | `number` | Tổng nhân tài active |
| `tier_counts` | `object` | `{Nòng cốt, Tiềm năng, Kế thừa, Chưa phân bổ}` |
| `positions_with_successors` | `number` | Số vị trí có kế thừa |
| `positions_no_successor` | `number` | Số vị trí không có kế thừa |
| `high_risk_talents` | `number` | Số nhân tài nguy cơ cao |
| `active_idps` | `number` | Số IDP đang active |
| `avg_idp_progress` | `number` | % tiến độ IDP trung bình |

---

## 4. SUPABASE SCHEMA SUMMARY

| Table/View | Columns chính | Relations | RLS (hiện tại) | Mô tả |
|---|---|---|---|---|
| `employees` | `id, full_name, position, department_id, talent_tier, performance_score, potential_score, risk_score, readiness_level, hire_date, tenure_years, ktp_progress, mentor_id, target_position, risk_score, email, comp_technical, comp_leadership, comp_communication, comp_problem_solving, comp_adaptability, comp_target_*, is_active` | FK → `departments`, `employees` (mentor_id, reports_to_id) | DISABLED (dev) | Bảng chính nhân viên |
| `v_employees` | Tất cả cột `employees` + `department_name, department_short, mentor_name` | View từ `employees` JOIN `departments` | READ via view | View để frontend đọc (flat shape) |
| `v_nine_box` | `id, full_name, performance_score, potential_score, department_id, talent_tier, risk_band, box (1-9)` | View từ `employees` | READ via view | View compute sẵn 9-box position |
| `key_positions` | `id, title, department_id, current_holder_id, critical_level, risk_level, required_competencies text[], parent_position_id, successor_count, ready_now_count, is_active` | FK → `departments`, `employees` (holder) | DISABLED (dev) | Vị trí then chốt |
| `succession_plans` | `id, position_id, talent_id, readiness, priority, gap_score` | FK → `key_positions`, `employees` | DISABLED (dev) | 1 row/successor. Unique (position_id, talent_id) |
| `departments` | `id, name, parent_id, head_id` | Self-ref parent | PUBLIC READ | Phòng ban / đơn vị |
| `idp_plans` | `id, employee_id, year, status, overall_progress, target_position, approved_by_l1_id, approved_by_l2_id, approved_by_l3_id, approved_by_l1_at, approved_by_l2_at, approved_by_l3_at` | FK → `employees` | DISABLED (dev) | Kế hoạch IDP |
| `idp_goals` | `id, idp_plan_id, title, type, category, deadline, status, progress, mentor` | FK → `idp_plans` | — | Mục tiêu trong IDP |
| `assessment_cycles` | `id, name, type, start_date, end_date, status, sort_order` | — | — | Chu kỳ đánh giá (seed: 5 chu kỳ 2024-2025) |
| `assessment_criteria` | `id, key, label, description, weight, category, sort_order, is_active` | — | — | Tiêu chí đánh giá (seed: 10 tiêu chí) |
| `assessment_scores` | `employee_id, cycle_id, criterion_id, score` | FK → `employees`, `assessment_cycles`, `assessment_criteria` | — | Điểm từng tiêu chí |
| `assessment_summary` | `employee_id, cycle_id, overall_score, rating_label, manager_note, strengths text[], needs_dev text[]` | FK → `employees`, `assessment_cycles` | — | Tổng hợp kết quả đánh giá |
| `assessment_display_config` | `id (=1), criterion_ids uuid[], updated_at` | FK → `assessment_criteria` | ADMIN only | Singleton: 4 tiêu chí hiển thị |
| `user_profiles` | `id, role (Admin/HR Manager/Line Manager/Viewer)` | FK → `auth.users` | DISABLED (dev) | Profile người dùng hệ thống |
| `audit_logs` | `id, timestamp, actor, action, entity, entity_id, description, module` | — | HR+ only | Lịch sử thay đổi |

**Bảng chưa có trong schema (cần tạo):**

| Table | Mô tả | Cần cho module |
|---|---|---|
| `mentoring_pairs` | Cặp kèm cặp | Mentoring |
| `mentoring_sessions` | Logbook từng buổi | Mentoring |
| `calibration_sessions` | Phiên họp calibration | Calibration |
| `calibration_entries` | Kết quả điều chỉnh per talent per session | Calibration |
| `risk_factors` | Chi tiết yếu tố rủi ro từng nhân viên | Talent Profile |
| `employee_career_reviews` | Kết quả đánh giá chu kỳ (career review) | Talent Profile |
| `employee_projects` | Dự án hiện tại | Talent Profile |
| `knowledge_transfer_plans` | Kế hoạch chuyển giao kiến thức | Talent Profile |
| `knowledge_transfer_items` | Từng hạng mục chuyển giao | Talent Profile |
| `employee_timeline` | Timeline sự kiện quan trọng | Talent Profile |

---

## 5. BUSINESS LOGIC QUAN TRỌNG

| Field/Rule | Formula | Dùng ở đâu | Lưu ý |
|---|---|---|---|
| `overall_score` | `round((performance_score + potential_score) / 2)` | Talent List sort, Profile hero | Fallback nếu DB không có `overall_score` |
| `risk_band` | `>=60` = High, `30-59` = Med, `<30` = Low | Talent List filter, Dashboard alerts | Dựa trên `risk_score` từ DB |
| `9-box position` | `box = f(perf_tier × pot_tier)` — xem bảng bên dưới | Succession 9-Box | View `v_nine_box` compute sẵn, default thresholds `[70, 85]` |
| `competency_gap` | `avg(max(0, target[k] - actual[k]))` trên 5 trục | Talent List tooltip | Tính client-side |
| `readiness_level` thresholds | `Ready Now`: gapScore≤10; `Ready 1Y`: gap 11-25; `Ready 2Y`: gap>25 | Talent filter, Position drawer | |
| `talent_tier` rules | `Nòng cốt`: perf≥85 AND pot≥85; `Kế thừa`: perf≥75 AND pot≥70; `Tiềm năng`: còn lại | Admin config | Hiện lưu trực tiếp trong DB, không tự động recalculate |
| `idp overall_progress` | `avg(goal.progress)` cho goals có `status != 'Not Started'` | IDP list, Profile | |
| `assessment overall` | `(avg(QL) × 0.5) + (avg(ĐN) × 0.3) + (avg(CĐ) × 0.2)` | Assessment, Profile | QL=Quản lý, ĐN=Đồng nghiệp, CĐ=Cấp dưới |
| `radar delta` | `actual - target` (>=0 = vượt chuẩn, <0 = cần cải thiện) | Talent Profile radar | 5 trục: Kỹ thuật, Hiệu suất, Hành vi, Tiềm năng, Lãnh đạo |
| `criticality_score` | `(impact × 0.4) + (replaceability × 0.35) + (knowledgeDepth × 0.25)` | Positions | Chưa implement UI, chỉ trong admin config |
| `dependency_score` | `1 − (readyNowCount / requiredSuccessors)` | Positions | 0=an toàn, 1=nguy hiểm |
| `mentoring effectiveness` | `(sessions_completed / sessions_total) × (menteeProgress / 100)` | Mentoring | |
| `risk vs dept avg` | `round(((talent.risk - avg(dept.risk)) / avg(dept.risk)) × 100)` | Talent Profile alert strip | Tính client-side từ allTalents signal |
| `unassigned count` | `max(1, round((core + potential + successor) × 0.12))` | Dashboard donut | Ước tính client-side, không có data thật |

**9-Box mapping (row=perf tier, col=pot tier):**

| Box | Perf | Pot | Label |
|---|---|---|---|
| 9 | High (≥85) | High (≥85) | Ngôi sao tương lai |
| 8 | High | Mid | Nhân tài nổi bật |
| 7 | High | Low (<70) | Ngôi sao tiềm ẩn |
| 6 | Mid | High | Lãnh đạo tiềm năng |
| 5 | Mid | Mid | Nhân tài cốt lõi |
| 4 | Mid | Low | Nhân viên vững |
| 3 | Low (<70) | High | Enigma |
| 2 | Low | Mid | Tiềm năng ẩn |
| 1 | Low | Low | Cần cải thiện |

---

## 6. AUTH & PERMISSIONS

**Auth method:** Supabase Auth — Email/Password + Google OAuth. JWT tự động refresh.

| Role | Quyền xem | Quyền sửa | Màn hình bị giới hạn |
|---|---|---|---|
| **Admin** | Toàn bộ | Toàn bộ + assessment display config | Không giới hạn |
| **HR Manager** | Toàn bộ | Tạo/sửa talent, IDP, assessment; không sửa modules/system config | `/admin` tab Settings bị giới hạn |
| **Line Manager** | Chỉ department mình | Sửa IDP của team, approve bước 1 | `/succession` chỉ thấy dept mình; không thấy toàn org |
| **Viewer** | Read-only toàn bộ | Không sửa gì | Không có nút Create/Edit |

**Hierarchy permission check:** `Viewer < Line Manager < HR Manager < Admin`

**Hiện tại:**
- `isAdmin()` được dùng để bảo vệ `updateDisplayConfig` trong Admin tab
- `isRestrictedView()` dùng để prune org tree trong Succession
- Chưa có middleware enforce ở các endpoint write khác — cần implement RLS/server-side check

**RLS status:**
- Tất cả tables quan trọng đã **DISABLE RLS** để dev (không production-safe)
- Cần bật RLS và viết policies trước khi go-live

---

## 7. CHECKLIST CHO BA

- [ ] **Confirm field names** với VnR data migration template — đặc biệt: `comp_technical`, `performance_score`, `potential_score`, `risk_score`, `ktp_progress`
- [ ] **Confirm business rules** với PTSC M&C HR team:
  - [ ] Công thức tính `risk_score` (hiện DB có sẵn, chưa rõ formula gốc)
  - [ ] Công thức tính `talent_tier` (hardcode rules hay HR nhập tay?)
  - [ ] Ngưỡng readiness: `gapScore ≤10 = Ready Now` — con số này HR đã confirm chưa?
  - [ ] `ktp_progress` tính từ đâu và ai cập nhật?
  - [ ] Approval IDP: 3 cấp là Line Manager → HR → Ban GĐ, confirm tên cụ thể?
- [ ] **Confirm role matrix** — 4 roles (Admin/HR Manager/Line Manager/Viewer) đủ chưa?
- [ ] **Confirm missing sections** trong Talent Profile: Career Review categories và weights (40/30/20/10) có đúng không?
- [ ] **Confirm calibration quorum**: ≥3 participants + ≥1 HR — có hợp lệ với quy trình thực tế?
- [ ] **Xác nhận modules chưa implement** cần ưu tiên nào trước: Mentoring hay Calibration?
- [ ] Sign off trước khi backend dev build các table mới (mentoring, calibration, risk_factors, ...)

---

## 8. CHECKLIST CHO BACKEND DEV

### Ưu tiên cao (blocking UI hiện tại)

- [ ] **Enable RLS** + viết policies cho tất cả tables (hiện đang disabled)
- [ ] **PATCH /employees/:id**: update mentor, target_position (hiện hardcode local)
- [ ] **GET/POST /employees/:id/career-review**: Career Review section trong Talent Profile
- [ ] **GET /employees/:id/current-project**: Current Project section trong Talent Profile
- [ ] **GET /employees/:id/knowledge-transfer**: KTP section trong Talent Profile
- [ ] **PATCH /idp/:id/approve**: Approval workflow IDP (bước 1/2/3)
- [ ] **POST /employees/sync**: VnR data sync endpoint

### Ưu tiên trung bình (module chưa wire)

- [ ] **Mentoring tables**: `mentoring_pairs`, `mentoring_sessions` + CRUD endpoints
- [ ] **Calibration tables**: `calibration_sessions`, `calibration_entries` + CRUD endpoints
- [ ] **GET /calibration-sessions/:id/export**: Export Excel

### Schema bổ sung cần tạo

- [ ] `risk_factors` table: `{id, employee_id, title, detail, severity, source, date}`
- [ ] `employee_timeline` table: `{id, employee_id, date, event_type, description}`
- [ ] `employee_projects` table: `{id, employee_id, name, type, role, client, value, status}`
- [ ] `knowledge_transfer_plans` + `knowledge_transfer_items` tables
- [ ] `employee_career_reviews` table với categories JSON

### RLS Policies cần viết

- [ ] `v_employees`: authenticated read; HR+ write via `employees` table
- [ ] `key_positions`: authenticated read; Admin/HR write
- [ ] `succession_plans`: authenticated read; Admin/HR/Line Manager (dept) write
- [ ] `idp_plans`: employee xem plan của mình; HR xem tất cả; Line Manager xem team
- [ ] `audit_logs`: HR+ read; system write only
- [ ] `assessment_display_config`: authenticated read; Admin write only

### Indexes cần có

- [ ] `v_employees (is_active, talent_tier)` — dashboard count queries
- [ ] `v_employees (is_active, risk_score)` — risk alerts
- [ ] `succession_plans (position_id)` — group by position
- [ ] `succession_plans (talent_id)` — lookup successor-of
- [ ] `idp_plans (employee_id)` — talent profile IDP lookup
- [ ] `assessment_scores (employee_id, cycle_id)` — radar chart
- [ ] `key_positions (current_holder_id)` — succession network

### Seed data yêu cầu khi test

- [ ] ≥500 active employees trong `v_employees`
- [ ] ≥40 key_positions với parent_position_id để test org tree
- [ ] ≥49 succession_plans (đã có)
- [ ] Assessment data cho ít nhất E001 qua tất cả 5 cycles

---

*Tài liệu được generate từ codebase bởi Claude Code. Regenerate khi có thay đổi lớn về services hoặc models.*
