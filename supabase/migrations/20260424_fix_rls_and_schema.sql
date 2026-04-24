-- =============================================================================
-- Migration: fix_rls_and_schema  ★ CHẠY NGAY TRONG SUPABASE SQL EDITOR ★
-- Mục đích:
--   1. Tắt RLS trên các bảng bị lỗi infinite recursion (user_profiles → cascade)
--   2. Thêm column competency_scores vào key_positions
--   3. Kiểm tra kết quả
--
-- ⚠️  An toàn cho môi trường Development / Staging.
--      Production cần thay thế bằng RLS policy đúng đắn sau này.
-- =============================================================================

-- ─── 1. Disable RLS trên các bảng bị ảnh hưởng ──────────────────────────────
-- Root cause: policy trên user_profiles tự tham chiếu → infinite recursion
-- → Supabase trả 42P17 khi bất kỳ bảng nào có policy join user_profiles

ALTER TABLE user_profiles   DISABLE ROW LEVEL SECURITY;
ALTER TABLE employees       DISABLE ROW LEVEL SECURITY;
ALTER TABLE key_positions   DISABLE ROW LEVEL SECURITY;
ALTER TABLE succession_plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE idp_plans       DISABLE ROW LEVEL SECURITY;

-- ─── 2. Thêm column competency_scores vào key_positions ──────────────────────
ALTER TABLE key_positions
  ADD COLUMN IF NOT EXISTS competency_scores JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN key_positions.competency_scores IS
  'Điểm mục tiêu cho từng năng lực (key → 0–100). '
  'Ví dụ: {"leadership": 80, "technical": 75}';

UPDATE key_positions
SET competency_scores = '{}'::jsonb
WHERE competency_scores IS NULL;

-- ─── 3. Kiểm tra kết quả ─────────────────────────────────────────────────────
-- Uncomment để xem trước khi close SQL Editor:

/*
-- Xem policy gây lỗi (để hiểu root cause):
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename IN ('user_profiles','key_positions','succession_plans','idp_plans')
ORDER BY tablename;

-- Xác nhận RLS đã tắt:
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('user_profiles','employees','key_positions','succession_plans','idp_plans');

-- Test đọc key_positions (phải trả data, không lỗi):
SELECT id, title, critical_level, competency_scores
FROM key_positions
WHERE is_active = true
LIMIT 5;
*/
