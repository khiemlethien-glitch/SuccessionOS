-- ══════════════════════════════════════════════════════════════════════════════
-- 20260429_alter_mentoring_pairs_schema.sql
--
-- Root cause: mentoring_pairs trong DB có schema cũ (focus_area, end_date)
-- trong khi app (mentoring.service.ts) expects:
--   duration_months, monthly_hours, skills[], skill_labels[], goals,
--   justification, reject_reason, initiated_by, initiator_id, updated_at
--
-- Fix: thêm các cột mới, migrate data từ cột cũ, giữ cột cũ để tương thích.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Thêm các cột mới ───────────────────────────────────────────────────────
ALTER TABLE mentoring_pairs
  ADD COLUMN IF NOT EXISTS duration_months  int          DEFAULT 6,
  ADD COLUMN IF NOT EXISTS monthly_hours    int          DEFAULT 8,
  ADD COLUMN IF NOT EXISTS skills           text[]       DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS skill_labels     text[]       DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS goals            text,
  ADD COLUMN IF NOT EXISTS justification    text,
  ADD COLUMN IF NOT EXISTS reject_reason    text,
  ADD COLUMN IF NOT EXISTS initiated_by     text         DEFAULT 'mentee',
  ADD COLUMN IF NOT EXISTS updated_at       timestamptz  DEFAULT now();

-- ── 2. Migrate data từ schema cũ ─────────────────────────────────────────────

-- duration_months: tính từ start_date → end_date (làm tròn tháng)
UPDATE mentoring_pairs
SET duration_months = GREATEST(1,
      EXTRACT(YEAR FROM AGE(end_date, start_date)) * 12
      + EXTRACT(MONTH FROM AGE(end_date, start_date))::int
    )::int
WHERE end_date IS NOT NULL
  AND start_date IS NOT NULL
  AND (duration_months IS NULL OR duration_months = 6);

-- skill_labels: copy từ focus_area thành mảng 1 phần tử
UPDATE mentoring_pairs
SET skill_labels = ARRAY[focus_area],
    skills       = ARRAY[lower(replace(focus_area, ' ', '_'))]
WHERE focus_area IS NOT NULL
  AND (skill_labels IS NULL OR skill_labels = '{}');

-- goals: dùng focus_area làm mục tiêu
UPDATE mentoring_pairs
SET goals = focus_area
WHERE focus_area IS NOT NULL
  AND goals IS NULL;

-- ── 3. Set DEFAULT cho monthly_hours nếu còn null ────────────────────────────
UPDATE mentoring_pairs SET monthly_hours = 8 WHERE monthly_hours IS NULL;
UPDATE mentoring_pairs SET duration_months = 6 WHERE duration_months IS NULL;

-- ── 4. Verify ─────────────────────────────────────────────────────────────────
SELECT id, status, duration_months, monthly_hours,
       skill_labels[1] AS skill, goals
FROM mentoring_pairs
LIMIT 5;
