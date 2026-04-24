-- =============================================================================
-- 20260424_truncate_for_reimport.sql
-- Xóa dữ liệu cũ (fake/seed) theo đúng thứ tự FK trước khi import CSV thật.
--
-- Chạy trong Supabase SQL Editor TRƯỚC khi chạy import_supabase.py
-- =============================================================================

-- ── Disable triggers tạm thời để tránh side-effects ──────────────────────────
SET session_replication_role = 'replica';

-- ── Xóa theo thứ tự: child → parent ──────────────────────────────────────────

-- Tables phụ thuộc employees / positions
TRUNCATE TABLE assessment_scores     RESTART IDENTITY CASCADE;
TRUNCATE TABLE assessment_summary    RESTART IDENTITY CASCADE;
TRUNCATE TABLE succession_plans      RESTART IDENTITY CASCADE;
TRUNCATE TABLE idp_goals             RESTART IDENTITY CASCADE;
TRUNCATE TABLE idp_plans             RESTART IDENTITY CASCADE;
TRUNCATE TABLE mentoring_pairs       RESTART IDENTITY CASCADE;
TRUNCATE TABLE calibration_sessions  RESTART IDENTITY CASCADE;
TRUNCATE TABLE audit_logs            RESTART IDENTITY CASCADE;
TRUNCATE TABLE career_roadmaps       RESTART IDENTITY CASCADE;
TRUNCATE TABLE employee_extras       RESTART IDENTITY CASCADE;
TRUNCATE TABLE external_scores       RESTART IDENTITY CASCADE;

-- assessment_criteria / cycles (không có deps chính)
TRUNCATE TABLE assessment_criteria   RESTART IDENTITY CASCADE;
TRUNCATE TABLE assessment_cycles     RESTART IDENTITY CASCADE;

-- key_positions (có thể reference employees)
TRUNCATE TABLE key_positions         RESTART IDENTITY CASCADE;

-- employees (depends on departments)
TRUNCATE TABLE employees             RESTART IDENTITY CASCADE;

-- departments (root)
TRUNCATE TABLE departments           RESTART IDENTITY CASCADE;

-- user_profiles (independent auth table)
TRUNCATE TABLE user_profiles         RESTART IDENTITY CASCADE;

-- ── Re-enable triggers ────────────────────────────────────────────────────────
SET session_replication_role = 'origin';

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT
    tablename,
    (SELECT COUNT(*) FROM information_schema.tables t
     WHERE t.table_name = tablename LIMIT 1) AS exists
FROM (VALUES
    ('departments'),
    ('employees'),
    ('assessment_cycles'),
    ('assessment_criteria'),
    ('assessment_scores'),
    ('user_profiles')
) AS t(tablename);
