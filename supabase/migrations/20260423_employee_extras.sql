-- Migration: employee_extras
-- Chạy trong Supabase SQL Editor một lần.
-- Lưu trữ dữ liệu per-employee: dự án, chuyển giao tri thức, đánh giá 360°, thống kê nhanh.

CREATE TABLE IF NOT EXISTS employee_extras (
  employee_id          TEXT PRIMARY KEY,

  -- Dự án hiện tại
  project_name         TEXT,
  project_type         TEXT,
  project_role         TEXT,
  project_client       TEXT,
  project_value        TEXT,
  project_status       TEXT DEFAULT 'active',

  -- Chuyển giao tri thức
  kt_successor         TEXT,
  kt_successor_role    TEXT,
  kt_start_date        DATE,
  kt_target_date       DATE,
  kt_overall_progress  INTEGER DEFAULT 0,
  kt_items             JSONB DEFAULT '[]'::jsonb,

  -- Đánh giá 360°
  a360_overall         NUMERIC(5,2),
  a360_benchmark       NUMERIC(5,2) DEFAULT 5,
  a360_period          TEXT,
  a360_sources         JSONB DEFAULT '[]'::jsonb,
  a360_criteria        JSONB DEFAULT '[]'::jsonb,
  a360_strengths       JSONB DEFAULT '[]'::jsonb,
  a360_needs_dev       JSONB DEFAULT '[]'::jsonb,
  a360_manager_note    TEXT,

  -- Thống kê nhanh
  training_hours       INTEGER DEFAULT 0,
  last_promotion_year  INTEGER,

  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- Cho phép anon đọc/ghi (phù hợp auth bypass hiện tại)
ALTER TABLE employee_extras ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'employee_extras' AND policyname = 'anon_all'
  ) THEN
    CREATE POLICY "anon_all" ON employee_extras
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
