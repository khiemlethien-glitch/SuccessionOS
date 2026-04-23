-- Migration: assessment_types
-- Thêm cột assessment_type vào assessment_criteria và assessment_summary
-- để phân biệt KPI (mặc định) và 360° (từ hệ thống ngoài)

-- ══════════════════════════════════════════════════════════
-- 1. assessment_criteria — thêm assessment_type
-- ══════════════════════════════════════════════════════════
ALTER TABLE assessment_criteria
  ADD COLUMN IF NOT EXISTS assessment_type TEXT NOT NULL DEFAULT 'kpi';

-- Index để query theo type nhanh hơn
CREATE INDEX IF NOT EXISTS assessment_criteria_type_idx
  ON assessment_criteria(assessment_type) WHERE is_active = true;

-- ══════════════════════════════════════════════════════════
-- 2. assessment_summary — thêm assessment_type
-- ══════════════════════════════════════════════════════════
ALTER TABLE assessment_summary
  ADD COLUMN IF NOT EXISTS assessment_type TEXT NOT NULL DEFAULT 'kpi';

-- Đảm bảo mỗi (employee_id, cycle_id, assessment_type) là unique
-- (thay thế unique constraint cũ nếu chỉ có (employee_id, cycle_id))
CREATE UNIQUE INDEX IF NOT EXISTS assessment_summary_emp_cycle_type_idx
  ON assessment_summary(employee_id, cycle_id, assessment_type);
