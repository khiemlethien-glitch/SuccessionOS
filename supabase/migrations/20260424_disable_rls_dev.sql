-- =============================================================================
-- 20260424_disable_rls_dev.sql
-- Mở quyền truy cập cho anon user trong môi trường Dev/Staging.
--
-- Vấn đề: external_scores và audit_logs chỉ cho phép 'authenticated' role,
-- trong khi app đang dùng anon key (auth guard bị bypass) → HTTP 400 permission denied.
--
-- ⚠️  CHỈ DÙNG CHO DEV/STAGING — không chạy lên Production.
-- =============================================================================

-- external_scores: disable RLS để anon có thể read/write tự do
ALTER TABLE external_scores  DISABLE ROW LEVEL SECURITY;

-- audit_logs: disable RLS để anon có thể read
ALTER TABLE audit_logs       DISABLE ROW LEVEL SECURITY;

-- departments: tree filter cần đọc để hiển thị phòng ban theo cấp bậc
ALTER TABLE departments      DISABLE ROW LEVEL SECURITY;

-- score_weight_config: singleton config — anon cần đọc để tính điểm tổng hợp
ALTER TABLE score_weight_config DISABLE ROW LEVEL SECURITY;

-- assessment_display_config: admin config — anon cần đọc để hiển thị tiêu chí
ALTER TABLE assessment_display_config DISABLE ROW LEVEL SECURITY;

-- employee_extras: profile extras — HR cần đọc/ghi
ALTER TABLE employee_extras  DISABLE ROW LEVEL SECURITY;

-- career_roadmaps: AI roadmap
ALTER TABLE career_roadmaps  DISABLE ROW LEVEL SECURITY;

-- assessment_criteria: cần đọc để hiển thị tên tiêu chí
ALTER TABLE assessment_criteria DISABLE ROW LEVEL SECURITY;

-- Confirm
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'external_scores', 'audit_logs', 'departments',
    'score_weight_config', 'assessment_display_config',
    'employee_extras', 'career_roadmaps', 'assessment_criteria'
  )
ORDER BY tablename;
