-- ══════════════════════════════════════════════════════════════════════════════
-- 20260429_comprehensive_schema_fix.sql
--
-- Comprehensive fix for all DB ↔ frontend mismatches discovered after VPS reset.
-- Safe to re-run: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE.
--
-- Issues fixed:
--   1. assessment_cycles.is_active  — missing → assessment service returns no cycles
--   2. idp_plans.target_position    — missing → IDP create/update fails
--   3. mentoring_pairs.initiator_id — missing → mentoring pair create fails
--   4. user_profiles.status         — missing → admin panel user list shows errors
--   5. user_profiles.last_sign_in_at— missing → admin panel user list shows errors
--   6. v_nine_box.risk_band         — missing → 9-box grid missing risk column
--   7. career_roadmaps UNIQUE(employee_id,track) — missing → upsert fails (400)
--   8. succession_plans UNIQUE(position_id,talent_id) — missing → upsert fails (400)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. assessment_cycles: add is_active ───────────────────────────────────────
ALTER TABLE public.assessment_cycles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Activate all existing cycles (they're all valid data)
UPDATE public.assessment_cycles SET is_active = true WHERE is_active IS DISTINCT FROM true;

-- ── 2. idp_plans: add target_position ────────────────────────────────────────
ALTER TABLE public.idp_plans
  ADD COLUMN IF NOT EXISTS target_position text;

-- ── 3. mentoring_pairs: add initiator_id ─────────────────────────────────────
ALTER TABLE public.mentoring_pairs
  ADD COLUMN IF NOT EXISTS initiator_id uuid;
-- Note: no FK to avoid auth.users / user_profiles type conflicts

-- ── 4. user_profiles: add status + last_sign_in_at ───────────────────────────
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz;

-- ── 5. v_nine_box: recreate with risk_band ────────────────────────────────────
-- DROP + CREATE required because column order change breaks CREATE OR REPLACE
DROP VIEW IF EXISTS public.v_nine_box;
CREATE VIEW public.v_nine_box AS
SELECT
  e.id,
  e.full_name,
  e.department_id,
  d.name          AS department_name,
  e.position,
  e.performance_score,
  e.potential_score,
  e.overall_score,
  e.talent_tier,
  e.readiness_level,
  e.risk_band,
  e.is_active,
  -- 9-box cell 1–9
  -- perf band: 3=High(≥70), 2=Med(40-69), 1=Low(<40)
  -- pot  band: 1=Low(<40),  2=Med(40-69), 3=High(≥70)
  (
    CASE WHEN e.performance_score >= 70 THEN 3
         WHEN e.performance_score >= 40 THEN 2
         ELSE 1
    END - 1
  ) * 3 +
  CASE WHEN e.potential_score >= 70 THEN 3
       WHEN e.potential_score >= 40 THEN 2
       ELSE 1
  END AS box
FROM public.employees e
LEFT JOIN public.departments d ON d.id = e.department_id;

GRANT SELECT ON public.v_nine_box TO postgres;

-- ── 6. career_roadmaps: UNIQUE(employee_id, track) for upsert ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'career_roadmaps'
      AND indexname = 'uq_career_roadmaps_employee_track'
  ) THEN
    CREATE UNIQUE INDEX uq_career_roadmaps_employee_track
      ON public.career_roadmaps (employee_id, track);
  END IF;
END$$;

-- ── 7. succession_plans: UNIQUE(position_id, talent_id) for upsert ────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'succession_plans'
      AND indexname = 'uq_succession_plans_position_talent'
  ) THEN
    CREATE UNIQUE INDEX uq_succession_plans_position_talent
      ON public.succession_plans (position_id, talent_id);
  END IF;
END$$;

-- ── 8. Reload PostgREST schema cache ──────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ── 9. Verify ────────────────────────────────────────────────────────────────
SELECT 'assessment_cycles.is_active'     AS check, count(*) AS active_cycles
  FROM public.assessment_cycles WHERE is_active = true
UNION ALL
SELECT 'v_nine_box.risk_band',            count(*) FROM public.v_nine_box WHERE risk_band IS NOT NULL
UNION ALL
SELECT 'user_profiles.status',            count(*) FROM public.user_profiles WHERE status = 'active'
UNION ALL
SELECT 'succession_plans unique idx',     count(*) FROM pg_indexes
  WHERE tablename='succession_plans' AND indexname='uq_succession_plans_position_talent'
UNION ALL
SELECT 'career_roadmaps unique idx',      count(*) FROM pg_indexes
  WHERE tablename='career_roadmaps' AND indexname='uq_career_roadmaps_employee_track';
