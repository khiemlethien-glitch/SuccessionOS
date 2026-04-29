-- ══════════════════════════════════════════════════════════════════════════════
-- 20260429_recreate_views.sql
--
-- Root cause: VPS reset wiped all views (v_employees, v_nine_box).
-- The mentoring_sessions table was also never created (auth.users ref failed).
-- This migration recreates all three + grants PostgREST access.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. v_employees ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_employees AS
SELECT
  e.id,
  e.full_name,
  e.email,
  e.phone,
  e.avatar_url,
  e.gender,
  e.date_of_birth,
  e.department_id,
  d.name          AS department_name,
  d.name_short    AS department_short,
  e.position,
  e.level,
  e.reports_to_id,
  e.hire_date,
  e.tenure_years,
  e.years_of_experience,
  e.contract_type,
  e.talent_tier,
  e.readiness_level,
  e.target_position,
  e.mentor_id,
  m.full_name     AS mentor_name,
  -- Scores
  e.performance_score,
  e.potential_score,
  e.overall_score,
  e.risk_score,
  e.risk_band,
  e.risk_reasons,
  e.departure_reasons,
  -- Competency scores
  e.comp_technical,
  e.comp_leadership,
  e.comp_communication,
  e.comp_problem_solving,
  e.comp_adaptability,
  -- Competency targets
  e.comp_target_technical,
  e.comp_target_leadership,
  e.comp_target_communication,
  e.comp_target_problem_solving,
  e.comp_target_adaptability,
  -- KTP
  e.ktp_progress,
  e.is_active,
  e.created_at,
  e.updated_at,
  -- Derived: potential_level from potential_score (thang 0-100)
  CASE
    WHEN e.potential_score >= 85 THEN 'Very High'
    WHEN e.potential_score >= 70 THEN 'High'
    WHEN e.potential_score >= 50 THEN 'Medium'
    ELSE 'Low'
  END AS potential_level
FROM public.employees e
LEFT JOIN public.departments d ON d.id = e.department_id
LEFT JOIN public.employees m  ON m.id = e.mentor_id;

-- ── 2. v_nine_box ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_nine_box AS
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
  e.is_active,
  -- 9-box cell 1–9: rows = performance band (H/M/L), cols = potential band
  -- performance band: 3=High(≥70), 2=Med(40-69), 1=Low(<40)
  -- potential  band: 1=Low(<40),  2=Med(40-69),  3=High(≥70)
  -- cell = (perf_band - 1) * 3 + pot_band → 1..9
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

-- ── 3. mentoring_sessions (if not exists) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mentoring_sessions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id          uuid        NOT NULL REFERENCES public.mentoring_pairs(id) ON DELETE CASCADE,
  session_date     date        NOT NULL DEFAULT CURRENT_DATE,
  duration_minutes int         NOT NULL DEFAULT 60,
  title            text        NOT NULL,
  mentee_notes     text,
  mentor_feedback  text,
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','confirmed','auto_confirmed')),
  logged_by        uuid,       -- employee id of logger (no auth.users ref)
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mentoring_sessions_pair_id
  ON public.mentoring_sessions (pair_id);

-- ── 4. PostgREST access ───────────────────────────────────────────────────────
GRANT SELECT ON public.v_employees         TO anon, authenticated;
GRANT SELECT ON public.v_nine_box          TO anon, authenticated;
GRANT ALL    ON public.mentoring_sessions  TO anon, authenticated;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ── 5. Verify ─────────────────────────────────────────────────────────────────
SELECT 'v_employees'      AS obj, count(*) AS rows FROM public.v_employees   WHERE is_active = true
UNION ALL
SELECT 'v_nine_box',       count(*)               FROM public.v_nine_box      WHERE is_active = true
UNION ALL
SELECT 'mentoring_sessions', count(*)             FROM public.mentoring_sessions;
