-- Migration: scores
-- Tạo 2 bảng:
--   external_scores      — điểm từ hệ thống bên ngoài (đánh giá năng lực + 360°)
--   score_weight_config  — trọng số tính điểm tổng hợp (singleton id=1)
-- Chạy trong Supabase SQL Editor một lần.

-- ══════════════════════════════════════════════════════════
-- 1. external_scores
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS external_scores (
  employee_id      TEXT        NOT NULL,
  cycle_id         TEXT        NOT NULL,

  -- Điểm đánh giá năng lực (nhập thủ công từ HR hoặc push từ hệ thống)
  assessment_score NUMERIC(6,2),

  -- Điểm 360° (push từ hệ thống 360° bên ngoài qua API)
  score_360        NUMERIC(6,2),

  -- Tiêu chí chi tiết từ hệ thống 360° (tùy chọn)
  criteria_json    JSONB        DEFAULT '[]'::jsonb,

  updated_at       TIMESTAMPTZ  DEFAULT now(),

  PRIMARY KEY (employee_id, cycle_id)
);

-- RLS
ALTER TABLE external_scores ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'external_scores' AND policyname = 'anon_all'
  ) THEN
    CREATE POLICY "anon_all" ON external_scores
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════
-- 2. score_weight_config (singleton — chỉ có 1 row, id=1)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS score_weight_config (
  id                INTEGER      PRIMARY KEY DEFAULT 1,
  assessment_weight INTEGER      NOT NULL DEFAULT 60,  -- % trọng số đánh giá năng lực
  weight_360        INTEGER      NOT NULL DEFAULT 40,  -- % trọng số 360°
  updated_at        TIMESTAMPTZ  DEFAULT now(),

  CONSTRAINT weights_sum_100 CHECK (assessment_weight + weight_360 = 100),
  CONSTRAINT single_row      CHECK (id = 1)
);

-- Seed giá trị mặc định
INSERT INTO score_weight_config (id, assessment_weight, weight_360)
VALUES (1, 60, 40)
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE score_weight_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'score_weight_config' AND policyname = 'anon_all'
  ) THEN
    CREATE POLICY "anon_all" ON score_weight_config
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
