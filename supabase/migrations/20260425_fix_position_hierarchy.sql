-- =============================================================================
-- Migration: fix_position_hierarchy (2026-04-25)
-- Mục đích: Điền parent_position_id cho các vị trí chưa có parent
--           bằng title-pattern matching (không phụ thuộc reports_to_id).
--
-- Root cause của migration cũ bị miss:
--   - v_employees.reports_to_id = NULL cho nhiều nhân viên cấp cao
--   - key_positions.current_holder_id = NULL cho một số vị trí top-level
--   → Recursive CTE không tìm được ancestor → parent_position_id vẫn NULL
--
-- An toàn: mỗi UPDATE chỉ chạy khi parent_position_id IS NULL
-- Chạy trong Supabase SQL Editor — có thể chạy lại an toàn.
-- =============================================================================

-- ─── BƯỚC 1: Phó TGĐ / Phó Tổng GĐ → ROOT (TGĐ) ────────────────────────────
UPDATE key_positions
SET parent_position_id = (
  SELECT id FROM key_positions
  WHERE is_active = true
    AND (
      title ILIKE '%tổng giám đốc%'
      OR title ILIKE '%CEO%'
      OR title = 'TGĐ'
    )
  ORDER BY title LIMIT 1
)
WHERE is_active = true
  AND parent_position_id IS NULL
  AND (
    title ILIKE '%phó tgđ%'
    OR title ILIKE '%phó tổng giám đốc%'
    OR title ILIKE '%phó tổng%'
    OR title ILIKE '%deputy ceo%'
  )
  AND title NOT ILIKE '%tổng giám đốc%';  -- không tự set chính nó

-- ─── BƯỚC 2: Giám đốc khối / Director → ROOT ─────────────────────────────────
-- (Gán tạm vào TGĐ; chỉnh tay nếu muốn phân về Phó TGĐ cụ thể)
UPDATE key_positions
SET parent_position_id = (
  SELECT id FROM key_positions
  WHERE is_active = true
    AND (
      title ILIKE '%tổng giám đốc%'
      OR title ILIKE '%CEO%'
      OR title = 'TGĐ'
    )
  ORDER BY title LIMIT 1
)
WHERE is_active = true
  AND parent_position_id IS NULL
  AND (
    title ILIKE '%giám đốc%'
    OR title ILIKE '%director%'
    OR title ILIKE '%cfo%'
    OR title ILIKE '%coo%'
    OR title ILIKE '%cto%'
    OR title ILIKE '%cmo%'
    OR title ILIKE '%chro%'
  )
  AND title NOT ILIKE '%phó%'          -- Phó đã xử lý bước 1
  AND title NOT ILIKE '%tổng giám đốc%'; -- ROOT không gán cho chính nó

-- ─── BƯỚC 3: Trưởng phòng → Giám đốc cùng department (nếu có) hoặc ROOT ──────
UPDATE key_positions kp
SET parent_position_id = COALESCE(
  -- Ưu tiên: Giám đốc cùng phòng/department đã được gán parent ở bước 2
  (
    SELECT pc.id
    FROM key_positions pc
    WHERE pc.is_active = true
      AND pc.id != kp.id
      AND pc.department_id = kp.department_id
      AND pc.parent_position_id IS NOT NULL   -- đã có parent = đã qua bước 1-2
      AND (
        pc.title ILIKE '%giám đốc%'
        OR pc.title ILIKE '%director%'
      )
    ORDER BY pc.title LIMIT 1
  ),
  -- Fallback: gán thẳng vào ROOT
  (
    SELECT id FROM key_positions
    WHERE is_active = true
      AND (title ILIKE '%tổng giám đốc%' OR title ILIKE '%CEO%' OR title = 'TGĐ')
    ORDER BY title LIMIT 1
  )
)
WHERE kp.is_active = true
  AND kp.parent_position_id IS NULL
  AND (
    kp.title ILIKE '%trưởng phòng%'
    OR kp.title ILIKE '%trưởng ban%'
    OR kp.title ILIKE '%manager%'
    OR kp.title ILIKE '%head of%'
    OR kp.title ILIKE '%trưởng nhóm%'
  );

-- ─── BƯỚC 4: Catch-all — mọi vị trí còn lại chưa có parent → ROOT ────────────
UPDATE key_positions kp
SET parent_position_id = (
  SELECT id FROM key_positions
  WHERE is_active = true
    AND (title ILIKE '%tổng giám đốc%' OR title ILIKE '%CEO%' OR title = 'TGĐ')
  ORDER BY title LIMIT 1
)
WHERE kp.is_active = true
  AND kp.parent_position_id IS NULL
  -- Chỉ để ROOT tự là NULL (không gán cho chính nó)
  AND kp.title NOT ILIKE '%tổng giám đốc%'
  AND kp.title NOT ILIKE '%CEO%'
  AND kp.title != 'TGĐ';

-- ─── KIỂM TRA KẾT QUẢ ────────────────────────────────────────────────────────
SELECT
  CASE
    WHEN kp.parent_position_id IS NULL THEN '★ ROOT'
    ELSE '└─ ' || parent.title
  END                   AS reports_to,
  kp.title              AS position_title,
  kp.current_holder_id,
  kp.department_id,
  kp.parent_position_id IS NOT NULL AS has_parent
FROM key_positions kp
LEFT JOIN key_positions parent ON parent.id = kp.parent_position_id
WHERE kp.is_active = true
ORDER BY
  kp.parent_position_id NULLS FIRST,
  parent.title NULLS FIRST,
  kp.title;
