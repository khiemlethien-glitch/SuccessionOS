-- =============================================================================
-- 20260427_fix_approval_admin_rls.sql
-- FIX: Admin không thấy approval_requests
--
-- Root cause có thể:
--   - Có policy cũ không rõ tên chưa bị drop
--   - is_hr_or_admin() không match 'Admin' trong một số context
--
-- Fix: Drop TOÀN BỘ policies hiện tại trên approval_requests (dù tên gì),
-- tạo lại policies sạch với inline subquery thay vì function.
-- =============================================================================

-- ── 1. Drop tất cả policies trên approval_requests ──────────────────────────
DO $$
DECLARE pol_name text;
BEGIN
  FOR pol_name IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'approval_requests'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON approval_requests', pol_name);
    RAISE NOTICE 'Dropped policy: %', pol_name;
  END LOOP;
END $$;

-- ── 2. Tạo lại policies sạch ─────────────────────────────────────────────────

-- Admin: thấy TẤT CẢ mọi request
-- Dùng inline subquery trực tiếp (không qua function) để tránh edge case
CREATE POLICY "apr_admin_all"
  ON approval_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'Admin'
    )
  );

-- HR Manager: thấy TẤT CẢ mọi request
CREATE POLICY "apr_hrm_all"
  ON approval_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'HR Manager'
    )
  );

-- Người tạo: thấy request do chính mình tạo
CREATE POLICY "apr_select_own"
  ON approval_requests FOR SELECT
  TO authenticated
  USING (requested_by_id = auth.uid()::text);

-- Approver: thấy request có step giao cho mình (approver_id match)
-- An toàn: approval_steps dùng USING(true) nên không còn circular
CREATE POLICY "apr_select_approver"
  ON approval_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approval_steps
      WHERE request_id = approval_requests.id
        AND approver_id = auth.uid()::text
    )
  );

-- Insert: mọi authenticated user tạo được request
CREATE POLICY "apr_insert_authenticated"
  ON approval_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Update: HR+Admin hoặc chính người tạo (recalc status)
CREATE POLICY "apr_update_authenticated"
  ON approval_requests FOR UPDATE
  TO authenticated
  USING (
    is_hr_or_admin()
    OR requested_by_id = auth.uid()::text
  );

-- ── 3. Verify ─────────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'approval_requests'
ORDER BY policyname;
