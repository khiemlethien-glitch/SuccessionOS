-- ══════════════════════════════════════════════════════════════════════════════
-- 20260429_fix_uuid_defaults.sql
--
-- Root cause: VPS reset → tất cả tables mất DEFAULT gen_random_uuid() trên
-- cột id (uuid NOT NULL). INSERT không có id → PostgREST 400 Bad Request.
--
-- Affected: key_positions, approval_requests, succession_plans, career_roadmaps,
--           mentoring_pairs, idp_plans, audit_logs, và các tables khác.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.approval_requests    ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.approval_steps       ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.assessment_criteria  ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.assessment_cycles    ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.audit_logs           ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.calibration_sessions ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.career_roadmaps      ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.departments          ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.employees            ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.idp_plans            ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.key_positions        ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.mentoring_pairs      ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.succession_plans     ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.user_profiles        ALTER COLUMN id SET DEFAULT gen_random_uuid();

NOTIFY pgrst, 'reload schema';

-- Verify
SELECT table_name, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'id'
  AND data_type = 'uuid'
ORDER BY table_name;
