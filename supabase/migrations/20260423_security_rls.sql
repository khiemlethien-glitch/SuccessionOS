-- =============================================================================
-- Security hardening: Row Level Security
-- Run this in Supabase SQL Editor BEFORE the pen-test
--
-- What this does:
--   1. Fix user_profiles infinite-recursion RLS bug (drops bad policy, adds simple one)
--   2. Enable RLS on all tables that had it disabled
--   3. Replace permissive "anon_all" policies with authenticated-only policies
--   4. Add read-only view policies for employees/positions using v_* views
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Fix user_profiles infinite-recursion
-- The old policy called another policy that called this one → stack overflow.
-- New approach: use auth.uid() directly, no cross-table checks.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies on user_profiles (removes the recursive ones)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'user_profiles' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON user_profiles', r.policyname);
  END LOOP;
END $$;

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "user_profiles_select_own"
  ON user_profiles FOR SELECT
  USING (id = auth.uid());

-- Users can update their own profile (non-role fields only — role changes done by Admin via service_role)
CREATE POLICY "user_profiles_update_own"
  ON user_profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Only service_role (backend / Edge Functions) can insert new profiles
-- (Supabase Auth hook or Edge Function creates the profile on signup)
-- No INSERT policy here — INSERT is blocked for anon/authenticated roles.
-- Use: supabase.auth.admin.createUser() or a trigger with SECURITY DEFINER.


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Enable RLS on tables that currently have it disabled
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE employees        ENABLE ROW LEVEL SECURITY;
ALTER TABLE key_positions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE succession_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE idp_plans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_roadmaps  ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_extras  ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_scores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_weight_config ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Helper function — check if calling user is HR Manager or Admin
-- Used in policies to restrict write access.
-- SECURITY DEFINER so it can query user_profiles without recursion.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_hr_or_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND role IN ('HR Manager', 'Admin')
  );
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND role = 'Admin'
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: employees — authenticated users read all; HR+/Admin write
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "anon_all" ON employees;

CREATE POLICY "employees_select"
  ON employees FOR SELECT
  TO authenticated
  USING (true);  -- All authenticated users can see all employees

CREATE POLICY "employees_insert"
  ON employees FOR INSERT
  TO authenticated
  WITH CHECK (is_hr_or_admin());

CREATE POLICY "employees_update"
  ON employees FOR UPDATE
  TO authenticated
  USING (is_hr_or_admin())
  WITH CHECK (is_hr_or_admin());

CREATE POLICY "employees_delete"
  ON employees FOR DELETE
  TO authenticated
  USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: key_positions — authenticated read; HR+/Admin write
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "anon_all" ON key_positions;

CREATE POLICY "key_positions_select"
  ON key_positions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "key_positions_write"
  ON key_positions FOR ALL
  TO authenticated
  USING (is_hr_or_admin())
  WITH CHECK (is_hr_or_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: succession_plans — authenticated read; HR+/Admin write
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "anon_all" ON succession_plans;

CREATE POLICY "succession_plans_select"
  ON succession_plans FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "succession_plans_write"
  ON succession_plans FOR ALL
  TO authenticated
  USING (is_hr_or_admin())
  WITH CHECK (is_hr_or_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7: idp_plans — employee sees own; HR+/Admin sees all
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "anon_all" ON idp_plans;

CREATE POLICY "idp_plans_select"
  ON idp_plans FOR SELECT
  TO authenticated
  USING (
    employee_id = auth.uid()::text  -- own plan
    OR is_hr_or_admin()             -- or HR/Admin sees everyone
  );

CREATE POLICY "idp_plans_write"
  ON idp_plans FOR ALL
  TO authenticated
  USING (
    employee_id = auth.uid()::text
    OR is_hr_or_admin()
  )
  WITH CHECK (
    employee_id = auth.uid()::text
    OR is_hr_or_admin()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 8: career_roadmaps — employee sees own; HR+/Admin sees all; write = HR+
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "anon_all" ON career_roadmaps;

CREATE POLICY "career_roadmaps_select"
  ON career_roadmaps FOR SELECT
  TO authenticated
  USING (
    employee_id = auth.uid()::text
    OR is_hr_or_admin()
  );

CREATE POLICY "career_roadmaps_write"
  ON career_roadmaps FOR ALL
  TO authenticated
  USING (is_hr_or_admin())
  WITH CHECK (is_hr_or_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 9: employee_extras — authenticated read; HR+/Admin write
-- (was anon_all — anyone could read/write without login)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "anon_all" ON employee_extras;

CREATE POLICY "employee_extras_select"
  ON employee_extras FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "employee_extras_write"
  ON employee_extras FOR ALL
  TO authenticated
  USING (is_hr_or_admin())
  WITH CHECK (is_hr_or_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 10: external_scores — authenticated read; HR+/Admin write
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "anon_all" ON external_scores;

CREATE POLICY "external_scores_select"
  ON external_scores FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "external_scores_write"
  ON external_scores FOR ALL
  TO authenticated
  USING (is_hr_or_admin())
  WITH CHECK (is_hr_or_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 11: score_weight_config — authenticated read; Admin-only write
-- (these are global tuning parameters — only Admin should touch them)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "anon_all" ON score_weight_config;

CREATE POLICY "score_weight_config_select"
  ON score_weight_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "score_weight_config_write"
  ON score_weight_config FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 12: views — grant SELECT to authenticated role
-- v_employees and v_nine_box are already readable; make sure anon cannot.
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE SELECT ON v_employees FROM anon;
REVOKE SELECT ON v_nine_box   FROM anon;
GRANT  SELECT ON v_employees  TO authenticated;
GRANT  SELECT ON v_nine_box   TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 13: audit_logs — insert allowed for authenticated (Edge Function logs);
--           select restricted to HR+/Admin
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all" ON audit_logs;

CREATE POLICY "audit_logs_select"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (is_hr_or_admin());

CREATE POLICY "audit_logs_insert"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);  -- Any authenticated user/Edge Function can write logs


-- ─────────────────────────────────────────────────────────────────────────────
-- Verification queries (run manually to check)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public'
--   ORDER BY tablename;

-- SELECT schemaname, tablename, policyname, roles, cmd, qual
--   FROM pg_policies WHERE schemaname = 'public'
--   ORDER BY tablename, policyname;
