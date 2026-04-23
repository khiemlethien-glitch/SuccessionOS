-- =============================================================================
-- seed_full.sql — SuccessionOS Full Seed
-- Chạy trong Supabase SQL Editor.
-- An toàn chạy nhiều lần (ON CONFLICT DO NOTHING / DO UPDATE).
-- =============================================================================

-- =============================================================================
-- 0. score_weight_config (singleton)
-- =============================================================================
INSERT INTO score_weight_config (id, assessment_weight, weight_360)
VALUES (1, 60, 40)
ON CONFLICT (id) DO NOTHING;


-- =============================================================================
-- 1. assessment_scores — 500 nhân viên × Chu kỳ 2025 × tất cả criteria active
-- Score có variance ngẫu nhiên nhưng nhất quán (dựa hashtext để reproducible).
-- =============================================================================
INSERT INTO assessment_scores (employee_id, cycle_id, criterion_id, score, created_at)
SELECT
  e.id                                                          AS employee_id,
  cy.id                                                         AS cycle_id,
  cr.id                                                         AS criterion_id,
  GREATEST(55, LEAST(100,
    60 + (abs(hashtext(e.id || cr.key)) % 41)
  ))::NUMERIC(6,2)                                              AS score,
  now() - interval '30 days'                                   AS created_at
FROM
  (SELECT id FROM v_employees LIMIT 500)                       AS e
  CROSS JOIN (
    SELECT id FROM assessment_cycles
    WHERE name = 'Chu kỳ 2025'
    LIMIT 1
  )                                                             AS cy
  CROSS JOIN (
    SELECT id, key FROM assessment_criteria
    WHERE is_active = true
      AND (assessment_type = 'kpi' OR assessment_type IS NULL)
  )                                                             AS cr
ON CONFLICT (employee_id, cycle_id, criterion_id) DO NOTHING;

-- Cũng seed cho Chu kỳ 2024 để dropdown có nhiều lựa chọn
INSERT INTO assessment_scores (employee_id, cycle_id, criterion_id, score, created_at)
SELECT
  e.id,
  cy.id,
  cr.id,
  GREATEST(50, LEAST(100,
    55 + (abs(hashtext(e.id || cr.key || '2024')) % 46)
  ))::NUMERIC(6,2),
  now() - interval '390 days'
FROM
  (SELECT id FROM v_employees LIMIT 500)                       AS e
  CROSS JOIN (
    SELECT id FROM assessment_cycles
    WHERE name = 'Chu kỳ 2024'
    LIMIT 1
  )                                                             AS cy
  CROSS JOIN (
    SELECT id, key FROM assessment_criteria
    WHERE is_active = true
      AND (assessment_type = 'kpi' OR assessment_type IS NULL)
  )                                                             AS cr
ON CONFLICT (employee_id, cycle_id, criterion_id) DO NOTHING;


-- =============================================================================
-- 2. assessment_summary — aggregate từ scores (1 row per employee × cycle)
-- =============================================================================

-- Chu kỳ 2025
INSERT INTO assessment_summary (employee_id, cycle_id, overall_score, rating_label, assessment_type)
SELECT
  s.employee_id,
  s.cycle_id,
  ROUND(AVG(s.score), 2)                                       AS overall_score,
  CASE
    WHEN AVG(s.score) >= 90 THEN 'Xuất sắc'
    WHEN AVG(s.score) >= 75 THEN 'Tốt'
    WHEN AVG(s.score) >= 60 THEN 'Đạt'
    ELSE 'Cần cải thiện'
  END                                                           AS rating_label,
  'kpi'                                                         AS assessment_type
FROM assessment_scores s
WHERE s.cycle_id = (SELECT id FROM assessment_cycles WHERE name = 'Chu kỳ 2025' LIMIT 1)
GROUP BY s.employee_id, s.cycle_id
ON CONFLICT (employee_id, cycle_id) DO UPDATE
  SET overall_score = EXCLUDED.overall_score,
      rating_label  = EXCLUDED.rating_label,
      updated_at    = now();

-- Chu kỳ 2024
INSERT INTO assessment_summary (employee_id, cycle_id, overall_score, rating_label, assessment_type)
SELECT
  s.employee_id,
  s.cycle_id,
  ROUND(AVG(s.score), 2),
  CASE
    WHEN AVG(s.score) >= 90 THEN 'Xuất sắc'
    WHEN AVG(s.score) >= 75 THEN 'Tốt'
    WHEN AVG(s.score) >= 60 THEN 'Đạt'
    ELSE 'Cần cải thiện'
  END,
  'kpi'
FROM assessment_scores s
WHERE s.cycle_id = (SELECT id FROM assessment_cycles WHERE name = 'Chu kỳ 2024' LIMIT 1)
GROUP BY s.employee_id, s.cycle_id
ON CONFLICT (employee_id, cycle_id) DO UPDATE
  SET overall_score = EXCLUDED.overall_score,
      rating_label  = EXCLUDED.rating_label,
      updated_at    = now();


-- =============================================================================
-- 3. external_scores — 20 nhân viên key (E001–E020)
-- assessment_score lấy từ summary, score_360 random 3.5–5.0
-- =============================================================================
INSERT INTO external_scores (
  employee_id, cycle_id, assessment_score, score_360, criteria_json, updated_at
)
SELECT
  e.id                                                          AS employee_id,
  cy.id                                                         AS cycle_id,
  sm.overall_score                                              AS assessment_score,
  ROUND((3.5 + (abs(hashtext(e.id || 'score360')) % 16) * 0.1)::NUMERIC, 1)
                                                                AS score_360,
  '[
    {"id":"c360_1","label":"Lãnh đạo","weight":20},
    {"id":"c360_2","label":"Giao tiếp","weight":20},
    {"id":"c360_3","label":"Hợp tác nhóm","weight":20},
    {"id":"c360_4","label":"Định hướng kết quả","weight":20},
    {"id":"c360_5","label":"Phát triển người khác","weight":20}
  ]'::jsonb                                                     AS criteria_json,
  now()                                                         AS updated_at
FROM
  (VALUES
    ('E001'),('E002'),('E003'),('E004'),('E005'),
    ('E006'),('E007'),('E008'),('E009'),('E010'),
    ('E011'),('E012'),('E013'),('E014'),('E015'),
    ('E016'),('E017'),('E018'),('E019'),('E020')
  ) AS e(id)
  CROSS JOIN (
    SELECT id FROM assessment_cycles WHERE name = 'Chu kỳ 2025' LIMIT 1
  )                                                             AS cy
  LEFT JOIN assessment_summary sm
    ON sm.employee_id = e.id
    AND sm.cycle_id = cy.id
ON CONFLICT (employee_id, cycle_id) DO UPDATE
  SET assessment_score = EXCLUDED.assessment_score,
      score_360        = EXCLUDED.score_360,
      updated_at       = now();


-- =============================================================================
-- 4. employee_extras — 20 nhân viên key
-- =============================================================================
INSERT INTO employee_extras (
  employee_id,
  training_hours, last_promotion_year,
  project_name, project_type, project_role, project_client, project_value, project_status,
  kt_successor, kt_successor_role, kt_start_date, kt_target_date, kt_overall_progress,
  a360_overall, a360_period, a360_manager_note,
  a360_strengths, a360_needs_dev
) VALUES
  ('E001', 120, 2024,
   'Chuyển đổi số PTSC M&C', 'Digital Transformation', 'Project Sponsor', 'PTSC M&C', '15 tỷ VND', 'active',
   'E002', 'Phó TGĐ', '2025-01-01', '2026-06-30', 75,
   4.5, 'Q4 2024', 'Lãnh đạo xuất sắc, cần uỷ quyền nhiều hơn.',
   '["Tầm nhìn chiến lược","Ra quyết định nhanh","Truyền cảm hứng team"]',
   '["Cần delegate nhiều hơn","Work-life balance"]'),

  ('E002',  95, 2023,
   'ERP Toàn công ty', 'IT/ERP', 'Project Lead', 'Internal', '8 tỷ VND', 'active',
   'E003', 'Phó CFO', '2025-02-01', '2026-12-31', 60,
   4.2, 'Q4 2024', 'Quản lý tài chính chắc chắn, cần phát triển kỹ năng mềm.',
   '["Phân tích tài chính sâu","Kiểm soát chi phí"]',
   '["Kỹ năng thuyết trình","Quản lý stakeholder"]'),

  ('E003',  80, 2024,
   'Tối ưu chuỗi cung ứng', 'Operations', 'Technical Lead', 'PTSC Logistics', '5 tỷ VND', 'active',
   'E004', 'Trưởng phòng Vận hành', '2025-03-01', '2026-09-30', 50,
   4.0, 'Q4 2024', 'Chuyên môn vững, cần thêm kinh nghiệm quản lý đội lớn.',
   '["Tối ưu quy trình","Kiến thức logistics"]',
   '["Leadership team lớn","Cross-department collaboration"]'),

  ('E004',  70, 2022,
   'Hệ thống HRIS mới', 'HR Technology', 'BA Lead', 'Internal', '3 tỷ VND', 'active',
   'E005', 'HR Manager', '2025-01-15', '2026-06-30', 45,
   3.8, 'Q4 2024', 'HRBP có kinh nghiệm, cần phát triển strategic HR.',
   '["Employee relations","Recruitment process"]',
   '["Strategic HR thinking","Analytics skills"]'),

  ('E005',  60, 2023,
   'An toàn lao động 2025', 'HSE', 'Safety Project Lead', 'PTSC', '2 tỷ VND', 'active',
   'E006', 'Deputy HSE Manager', '2025-02-01', '2026-12-31', 40,
   3.9, 'Q4 2024', 'Chuyên gia HSE uy tín, cần mở rộng phạm vi quản lý.',
   '["HSE expertise","Risk assessment"]',
   '["Strategic planning","Budget management"]'),

  ('E006',  55, 2022,
   'Báo cáo ESG 2025', 'Sustainability', 'ESG Project Lead', 'Board', '1.5 tỷ VND', 'active',
   'E007', 'ESG Analyst Senior', '2025-03-01', '2026-12-31', 35,
   3.7, 'Q4 2024', 'Tiên phong ESG trong tổ chức.',
   '["ESG framework knowledge","Stakeholder reporting"]',
   '["Implementation execution","Team building"]'),

  ('E007',  85, 2024,
   'Nâng cấp nhà máy K2', 'Engineering', 'Project Manager', 'K2 Plant JV', '20 tỷ VND', 'active',
   'E008', 'Kỹ sư trưởng Cơ khí', '2025-01-01', '2026-06-30', 55,
   4.3, 'Q4 2024', 'Kỹ sư xuất sắc với track record tốt.',
   '["Technical expertise","Project delivery"]',
   '["Commercial awareness","International exposure"]'),

  ('E008',  75, 2023,
   'Compliance Framework 2025', 'Legal & Compliance', 'Compliance Lead', 'Internal', '2 tỷ VND', 'active',
   'E009', 'Legal Counsel Senior', '2025-02-01', '2026-09-30', 30,
   3.6, 'Q4 2024', 'Chuyên môn pháp lý vững, cần thêm business acumen.',
   '["Legal knowledge","Risk identification"]',
   '["Business partner mindset","Communication"]'),

  ('E009',  90, 2024,
   'Mở rộng thị trường Đông Nam Á', 'Commercial', 'Commercial Lead', 'External Partners', '25 tỷ VND', 'active',
   'E010', 'Sales Manager B2B', '2025-01-01', '2026-12-31', 65,
   4.4, 'Q4 2024', 'Sales leader hiệu quả với network rộng.',
   '["Customer relationship","Deal closing"]',
   '["Team development","Strategic planning"]'),

  ('E010',  65, 2022,
   'Quản lý chất lượng ISO 2025', 'QA/QC', 'QA Manager', 'Internal', '1 tỷ VND', 'active',
   'E011', 'QA Lead Senior', '2025-03-01', '2027-01-01', 40,
   3.8, 'Q4 2024', 'QA chuyên nghiệp, cần phát triển leadership.',
   '["Quality systems","Process improvement"]',
   '["People management","Influence without authority"]'),

  ('E011',  50, 2023,
   'Thăm dò dầu khí Block B', 'Upstream', 'Technical Advisor', 'JV Partner', '50 tỷ VND', 'active',
   'E012', 'Sr. Petroleum Engineer', '2025-04-01', '2027-06-30', 35,
   3.5, 'Q4 2024', 'Chuyên gia upstream giàu kinh nghiệm.',
   '["Technical expertise","Mentoring juniors"]',
   '["Project management","Documentation"]'),

  ('E012',  78, 2024,
   'MES/SCADA Deployment', 'IT/OT Integration', 'Solution Architect', 'PTSC Plant', '12 tỷ VND', 'active',
   'E013', 'IT Lead OT Systems', '2025-02-01', '2026-12-31', 50,
   4.1, 'Q4 2024', 'IT architect có tư duy hệ thống tốt.',
   '["System architecture","Technology roadmap"]',
   '["Change management","Stakeholder buy-in"]'),

  ('E013',  62, 2022,
   'Tái cơ cấu tổ chức 2025', 'Organizational Development', 'Change Manager', 'Executive', '3 tỷ VND', 'active',
   'E014', 'HRBP Senior', '2025-01-01', '2026-06-30', 45,
   3.9, 'Q4 2024', 'OD professional với kinh nghiệm change management.',
   '["Organizational design","Employee engagement"]',
   '["Data-driven HR","Talent analytics"]'),

  ('E014',  88, 2024,
   'Pipeline Inspection & Maintenance', 'Mechanical Engineering', 'Maintenance Lead', 'PTSC', '8 tỷ VND', 'active',
   'E015', 'Technical Supervisor Mechanical', '2025-03-01', '2026-09-30', 60,
   4.2, 'Q4 2024', 'Maintenance expert đáng tin cậy.',
   '["Preventive maintenance","Safety compliance"]',
   '["Budget planning","Contractor management"]'),

  ('E015',  72, 2023,
   'Chương trình Đào tạo Nội bộ 2025', 'Learning & Development', 'L&D Manager', 'Internal', '2 tỷ VND', 'active',
   'E016', 'L&D Specialist Senior', '2025-01-01', '2026-12-31', 40,
   3.7, 'Q4 2024', 'L&D manager sáng tạo với kết quả đo lường rõ.',
   '["Training design","Learning technology"]',
   '["ROI measurement","Executive coaching"]'),

  ('E016',  58, 2022,
   'Financial Reporting Automation', 'Finance', 'Finance Project Manager', 'Internal', '2 tỷ VND', 'active',
   'E017', 'Senior Accountant', '2025-02-01', '2026-06-30', 30,
   3.6, 'Q4 2024', 'Finance professional chặt chẽ, cần thêm strategic thinking.',
   '["Financial accuracy","Compliance"]',
   '["Business partnering","Forecasting"]'),

  ('E017',  82, 2024,
   'Bảo trì Thiết bị Nhà máy K1', 'Maintenance Engineering', 'Maintenance Manager', 'K1 Plant', '10 tỷ VND', 'active',
   'E018', 'Maintenance Lead K1', '2025-01-15', '2026-09-30', 55,
   4.0, 'Q4 2024', 'Maintenance manager có kinh nghiệm thực chiến.',
   '["Reliability engineering","Team leadership"]',
   '["Digital maintenance tools","Cost optimization"]'),

  ('E018',  68, 2023,
   'Procurement Reform Program', 'Supply Chain', 'Procurement Lead', 'Internal', '5 tỷ VND', 'active',
   'E019', 'Senior Buyer', '2025-03-01', '2026-12-31', 35,
   3.8, 'Q4 2024', 'Procurement specialist với thành tích tiết kiệm chi phí tốt.',
   '["Vendor management","Contract negotiation"]',
   '["Strategic sourcing","Digital procurement"]'),

  ('E019',  76, 2024,
   'CRM & Customer Experience', 'Commercial Technology', 'CRM Project Lead', 'External Consultants', '6 tỷ VND', 'active',
   'E020', 'CRM Analyst Senior', '2025-02-01', '2026-06-30', 45,
   3.9, 'Q4 2024', 'Commercial leader với mindset customer-centric.',
   '["Customer insights","Data analysis"]',
   '["Product management","Agile methodology"]'),

  ('E020',  54, 2022,
   'Internal Audit 2025', 'Internal Audit', 'Lead Auditor', 'Audit Committee', '1 tỷ VND', 'active',
   'E021', 'Internal Auditor Senior', '2025-04-01', '2027-01-01', 30,
   3.5, 'Q4 2024', 'Kiểm toán viên kỹ lưỡng, cần phát triển advisory role.',
   '["Risk assessment","Process audit"]',
   '["Business advisory","Communication to C-suite"]')

ON CONFLICT (employee_id) DO UPDATE
  SET training_hours       = EXCLUDED.training_hours,
      last_promotion_year  = EXCLUDED.last_promotion_year,
      project_name         = EXCLUDED.project_name,
      project_type         = EXCLUDED.project_type,
      project_role         = EXCLUDED.project_role,
      project_client       = EXCLUDED.project_client,
      project_value        = EXCLUDED.project_value,
      project_status       = EXCLUDED.project_status,
      kt_successor         = EXCLUDED.kt_successor,
      kt_successor_role    = EXCLUDED.kt_successor_role,
      kt_start_date        = EXCLUDED.kt_start_date,
      kt_target_date       = EXCLUDED.kt_target_date,
      kt_overall_progress  = EXCLUDED.kt_overall_progress,
      a360_overall         = EXCLUDED.a360_overall,
      a360_period          = EXCLUDED.a360_period,
      a360_manager_note    = EXCLUDED.a360_manager_note,
      a360_strengths       = EXCLUDED.a360_strengths,
      a360_needs_dev       = EXCLUDED.a360_needs_dev,
      updated_at           = now();


-- =============================================================================
-- 5. audit_logs — sample events cho 5 nhân viên key (để Tab "Lịch sử" có data)
-- =============================================================================
INSERT INTO audit_logs (id, timestamp, actor, action, entity, entity_id, description, module)
VALUES
  -- E001
  (gen_random_uuid(), now() - interval '5 days',  'HR System', 'UPDATE', 'employee', 'E001', 'Cập nhật hồ sơ năng lực', 'talent'),
  (gen_random_uuid(), now() - interval '35 days', 'HR System', 'CREATE', 'employee', 'E001', 'Tham gia chương trình Talent Pool 2025', 'talent'),
  (gen_random_uuid(), now() - interval '95 days', 'Trần Minh Tuấn', 'UPDATE', 'employee', 'E001', 'Xác nhận vào succession plan TGĐ', 'succession'),
  -- E002
  (gen_random_uuid(), now() - interval '10 days', 'HR System', 'UPDATE', 'employee', 'E002', 'Cập nhật điểm đánh giá Q4 2024', 'assessment'),
  (gen_random_uuid(), now() - interval '60 days', 'HR System', 'CREATE', 'employee', 'E002', 'Tạo kế hoạch IDP 2025', 'idp'),
  -- E003
  (gen_random_uuid(), now() - interval '15 days', 'Lê Thị Hà',    'UPDATE', 'employee', 'E003', 'Hoàn thành đánh giá 360° Q4 2024', 'assessment'),
  (gen_random_uuid(), now() - interval '80 days', 'HR System',    'UPDATE', 'employee', 'E003', 'Bổ nhiệm làm Technical Lead dự án K2', 'talent'),
  -- E004
  (gen_random_uuid(), now() - interval '20 days', 'HR System', 'UPDATE', 'employee', 'E004', 'Cập nhật tiến độ IDP', 'idp'),
  -- E005
  (gen_random_uuid(), now() - interval '8 days',  'Nguyễn Văn Sơn', 'CREATE', 'employee', 'E005', 'Thêm vào danh sách kế thừa vị trí HSE Manager', 'succession')
ON CONFLICT DO NOTHING;


-- =============================================================================
-- DONE — Verify counts
-- =============================================================================
SELECT 'assessment_scores'  AS tbl, COUNT(*) AS rows FROM assessment_scores
UNION ALL
SELECT 'assessment_summary' AS tbl, COUNT(*) AS rows FROM assessment_summary
UNION ALL
SELECT 'external_scores'    AS tbl, COUNT(*) AS rows FROM external_scores
UNION ALL
SELECT 'employee_extras'    AS tbl, COUNT(*) AS rows FROM employee_extras
UNION ALL
SELECT 'audit_logs'         AS tbl, COUNT(*) AS rows FROM audit_logs;
