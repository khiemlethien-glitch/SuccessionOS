-- =============================================================================
-- 20260427_approval_rls.sql
-- Fix RLS cho approval_requests + approval_steps:
--   - Admin / HR Manager: thấy TẤT CẢ requests (toàn cty)
--   - Line Manager: thấy requests có LM step được giao (approver_id match hoặc null)
--   - Viewer / nhân viên: chỉ thấy request do chính họ tạo
--
-- Đồng thời fix existing rows: điền approver_id cho HRM steps đang NULL
-- =============================================================================

-- ── 0. Đảm bảo function is_hr_or_admin() + is_admin() đã tồn tại ─────────────
--    (Đã tạo trong 20260423_security_rls.sql — chạy lại để đảm bảo)
CREATE OR REPLACE FUNCTION is_hr_or_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('HR Manager', 'Admin')
  );
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'Admin'
  );
$$;

-- ── 1. approval_requests: Enable RLS + policies ───────────────────────────────
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;

-- Xóa policy cũ nếu có
DROP POLICY IF EXISTS "apr_select_own"          ON approval_requests;
DROP POLICY IF EXISTS "apr_select_approver"     ON approval_requests;
DROP POLICY IF EXISTS "apr_select_hr_admin"     ON approval_requests;
DROP POLICY IF EXISTS "apr_insert_authenticated" ON approval_requests;
DROP POLICY IF EXISTS "apr_update_authenticated" ON approval_requests;

-- Admin + HR Manager: thấy TẤT CẢ
CREATE POLICY "apr_select_hr_admin"
  ON approval_requests FOR SELECT
  TO authenticated
  USING (is_hr_or_admin());

-- Người tạo request thấy request của mình
CREATE POLICY "apr_select_own"
  ON approval_requests FOR SELECT
  TO authenticated
  USING (requested_by_id = auth.uid()::text);

-- Approver (LM/Admin có approver_id = auth.uid() trong bất kỳ step nào)
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

-- Insert: mọi authenticated user đều có thể tạo request
CREATE POLICY "apr_insert_authenticated"
  ON approval_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Update: chỉ HR+Admin và service (recalc status)
CREATE POLICY "apr_update_authenticated"
  ON approval_requests FOR UPDATE
  TO authenticated
  USING (is_hr_or_admin() OR requested_by_id = auth.uid()::text);

-- ── 2. approval_steps: Enable RLS + policies ──────────────────────────────────
ALTER TABLE approval_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "steps_select_hr_admin"  ON approval_steps;
DROP POLICY IF EXISTS "steps_select_approver"  ON approval_steps;
DROP POLICY IF EXISTS "steps_select_requestor" ON approval_steps;
DROP POLICY IF EXISTS "steps_insert"           ON approval_steps;
DROP POLICY IF EXISTS "steps_update"           ON approval_steps;

-- Admin + HR Manager: thấy tất cả steps
CREATE POLICY "steps_select_hr_admin"
  ON approval_steps FOR SELECT
  TO authenticated
  USING (is_hr_or_admin());

-- Approver thấy step được giao cho mình
CREATE POLICY "steps_select_approver"
  ON approval_steps FOR SELECT
  TO authenticated
  USING (approver_id = auth.uid()::text);

-- Requestor thấy tất cả steps của request do mình tạo
CREATE POLICY "steps_select_requestor"
  ON approval_steps FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approval_requests
      WHERE id = approval_steps.request_id
        AND requested_by_id = auth.uid()::text
    )
  );

-- Insert: service role (approval.service.ts tạo steps khi submit)
CREATE POLICY "steps_insert"
  ON approval_steps FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Update: approver cập nhật step của mình (approve/reject)
CREATE POLICY "steps_update"
  ON approval_steps FOR UPDATE
  TO authenticated
  USING (
    approver_id = auth.uid()::text
    OR is_hr_or_admin()
  );

-- ── 3. Backfill: điền approver_id cho tất cả HRM steps đang NULL ─────────────
--    Dùng UUID của user_profiles đầu tiên có role = 'HR Manager'
UPDATE approval_steps
SET approver_id = (
  SELECT id::text FROM user_profiles WHERE role = 'HR Manager' LIMIT 1
)
WHERE approver_role = 'HR Manager'
  AND approver_id IS NULL;

-- ── 4. Verify ─────────────────────────────────────────────────────────────────
SELECT
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('approval_requests', 'approval_steps')
ORDER BY tablename, policyname;
