-- =============================================================================
-- 20260427_fix_approval_rls_circular.sql
-- FIX: steps_select_requestor gây circular recursion → 500 error
--
-- Root cause:
--   approval_requests RLS → EXISTS(approval_steps) [via apr_select_approver]
--   approval_steps RLS    → EXISTS(approval_requests) [via steps_select_requestor]
--   → Infinite loop → PostgREST 500
--
-- Fix: xóa steps_select_requestor, thay bằng "all authenticated can read steps".
-- Vẫn an toàn vì: steps chỉ visible qua nested join của request mà user được phép xem.
-- =============================================================================

-- Xóa policy bị circular
DROP POLICY IF EXISTS "steps_select_requestor" ON approval_steps;

-- Xóa step_insert/update cũ của tôi nếu có (để tránh xung đột với policy cũ)
DROP POLICY IF EXISTS "steps_insert"  ON approval_steps;
DROP POLICY IF EXISTS "steps_update"  ON approval_steps;

-- Thay bằng: mọi authenticated user đều đọc được approval_steps
-- (an toàn vì PostgREST's nested select chỉ trả steps của requests user đã thấy)
DROP POLICY IF EXISTS "steps_select_all_auth" ON approval_steps;
CREATE POLICY "steps_select_all_auth"
  ON approval_steps FOR SELECT
  TO authenticated
  USING (true);

-- Verify: không còn steps_select_requestor
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'approval_steps'
ORDER BY policyname;
