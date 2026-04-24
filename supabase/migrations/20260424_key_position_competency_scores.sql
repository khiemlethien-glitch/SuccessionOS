-- =============================================================================
-- Migration: key_position_competency_scores
-- Mục đích: Thêm cột competency_scores JSONB vào key_positions để lưu điểm
--           mục tiêu cho từng năng lực yêu cầu của mỗi vị trí then chốt.
--
-- Schema: { "leadership": 80, "technical": 75, "communication": 70, ... }
-- Giá trị: 0–100 (điểm trên thang 100)
--
-- Chạy trong Supabase SQL Editor một lần.
-- An toàn chạy lại: IF NOT EXISTS / IF NOT EXISTS guard.
-- =============================================================================

ALTER TABLE key_positions
  ADD COLUMN IF NOT EXISTS competency_scores JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN key_positions.competency_scores IS
  'Điểm mục tiêu cho từng năng lực yêu cầu (key → 0–100). '
  'Ví dụ: {"leadership": 80, "technical": 75, "communication": 70}. '
  'Các key khớp với mảng required_competencies.';

-- Khởi tạo giá trị mặc định cho các hàng hiện có (nếu NULL):
UPDATE key_positions
SET competency_scores = '{}'::jsonb
WHERE competency_scores IS NULL;
