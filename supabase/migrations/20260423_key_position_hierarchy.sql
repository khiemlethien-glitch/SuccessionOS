-- =============================================================================
-- Migration: key_position_hierarchy
-- Mục đích: Tự động điền parent_position_id dựa vào chuỗi reports_to_id
--           của nhân viên đang giữ mỗi vị trí then chốt.
--
-- Logic:
--   Với mỗi vị trí then chốt, đi ngược chuỗi reports_to_id của người đương nhiệm.
--   Gặp manager đầu tiên cũng đang giữ một vị trí then chốt → đó là parent.
--   Nếu không tìm được → giữ NULL (root node trên cây).
--
-- Chạy trong Supabase SQL Editor một lần.
-- An toàn chạy lại: chỉ UPDATE khi tìm được parent (không xóa data hiện có).
-- =============================================================================

-- ─── Step 1: Suy ra parent từ reporting chain ──────────────────────────────
-- Dùng recursive CTE trên bảng employees (base table của v_employees view).
-- Nếu v_employees là view trực tiếp trên bảng employees, thay tên bảng nếu cần.

WITH RECURSIVE

-- Lấy danh sách vị trí then chốt + employee đương nhiệm + manager của họ
kp_holders AS (
  SELECT
    kp.id          AS pos_id,
    kp.title       AS pos_title,
    e.id           AS holder_id,
    e.reports_to_id AS manager_id
  FROM key_positions kp
  JOIN v_employees e ON e.id = kp.current_holder_id
  WHERE kp.is_active = true
    AND kp.current_holder_id IS NOT NULL
),

-- Đi ngược chuỗi reporting tối đa 10 bậc để tìm ancestor
reporting_chain AS (
  -- Base: bắt đầu từ direct manager của người đương nhiệm
  SELECT
    kph.pos_id   AS source_pos_id,
    kph.manager_id AS candidate_emp_id,
    1            AS hop
  FROM kp_holders kph
  WHERE kph.manager_id IS NOT NULL

  UNION ALL

  -- Đệ quy: tiếp tục đi lên nếu chưa tìm thấy key position holder
  SELECT
    rc.source_pos_id,
    e.reports_to_id AS candidate_emp_id,
    rc.hop + 1
  FROM reporting_chain rc
  JOIN v_employees e ON e.id = rc.candidate_emp_id
  WHERE rc.hop < 10
    AND rc.candidate_emp_id IS NOT NULL
    AND e.reports_to_id IS NOT NULL
    -- Dừng nếu candidate này đã là holder của 1 key position
    AND NOT EXISTS (
      SELECT 1 FROM key_positions kp2
      WHERE kp2.current_holder_id = rc.candidate_emp_id
        AND kp2.id != rc.source_pos_id
        AND kp2.is_active = true
    )
),

-- Kết hợp: với mỗi source_pos, lấy hop nhỏ nhất có key position cha
parent_mapping AS (
  SELECT DISTINCT ON (rc.source_pos_id)
    rc.source_pos_id              AS child_pos_id,
    kp_parent.id                  AS parent_pos_id,
    kp_parent.title               AS parent_title,
    rc.hop
  FROM reporting_chain rc
  JOIN key_positions kp_parent
    ON  kp_parent.current_holder_id = rc.candidate_emp_id
    AND kp_parent.id != rc.source_pos_id
    AND kp_parent.is_active = true
  ORDER BY rc.source_pos_id, rc.hop ASC  -- nearest ancestor wins
)

-- ─── Step 2: Áp dụng vào key_positions ───────────────────────────────────
UPDATE key_positions kp
SET parent_position_id = pm.parent_pos_id
FROM parent_mapping pm
WHERE kp.id = pm.child_pos_id;

-- ─── Step 3: Kiểm tra kết quả ─────────────────────────────────────────────
-- Chạy SELECT này để xem kết quả trước/sau (comment out khi production):
/*
SELECT
  kp.id,
  kp.title,
  kp.parent_position_id,
  parent.title AS parent_title
FROM key_positions kp
LEFT JOIN key_positions parent ON parent.id = kp.parent_position_id
WHERE kp.is_active = true
ORDER BY kp.parent_position_id NULLS FIRST, kp.title;
*/
