-- ══════════════════════════════════════════════════════════════════════════════
-- 20260429_idp_goals.sql
--
-- idp_goals table was referenced in idp.service.ts but never created.
-- PostgREST returns 400 "Could not find relationship" when querying
--   idp_plans?select=*,goals:idp_goals(*)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.idp_goals (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  idp_plan_id  uuid        NOT NULL REFERENCES public.idp_plans(id) ON DELETE CASCADE,
  title        text        NOT NULL,
  type         text        NOT NULL DEFAULT 'Training',   -- Training | Project | Mentoring | Self-study
  category     text,                                       -- alias for type
  deadline     date,
  status       text        NOT NULL DEFAULT 'Not Started'
               CHECK (status IN ('Not Started','In Progress','Completed','Cancelled')),
  progress     int         NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  mentor       text,                                       -- free-text mentor name
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_idp_goals_idp_plan_id ON public.idp_goals (idp_plan_id);

ALTER TABLE public.idp_goals DISABLE ROW LEVEL SECURITY;

GRANT ALL ON public.idp_goals TO postgres;

NOTIFY pgrst, 'reload schema';

-- Verify
SELECT count(*) AS idp_goals_rows FROM public.idp_goals;
