-- =============================================================================
-- 20260424_keep_23_employees.sql
-- Xóa toàn bộ nhân viên NGOẠI TRỪ 23 người có data KPI đầy đủ.
-- Đồng thời xóa toàn bộ dữ liệu phụ thuộc (sẽ import lại từ CSV).
-- =============================================================================

-- ─── STEP 0: PREVIEW — xem ai sẽ bị xóa (uncomment để chạy riêng) ───────────
/*
SELECT id, full_name FROM employees
WHERE full_name NOT IN (
  'Chu Nhất Phương','Dương Hữu Huyền','Dương Ngọc Hạnh',
  'Huỳnh Thanh Chi','Lê Gia Khôi','Lê Hồng Lam',
  'Lê Thị Minh Hải','Lý Quang Hân','Nguyễn Ngọc Lan Oanh',
  'Nguyễn Ngọc Đoan Trinh','Nguyễn Thị Phương Thảo','Nguyễn Xuân Tuyến',
  'Ngọc Đỗ Đi Học 1','Trần Ngọc Yến','Trần Thế Nhân',
  'Tôn Trúc Thu','Võ Ngọc Vinh','Võ Thanh Sơn',
  'Võ Thị Ngọc Mai','Vũ Gia Đan','Vũ Ngọc Hạnh',
  'Vũ Trúc Thắng','Đặng Khánh Hạnh'
)
ORDER BY full_name;
*/

-- Disable FK triggers để tránh constraint errors
SET session_replication_role = 'replica';

-- Xóa sạch toàn bộ dữ liệu phụ thuộc (sẽ import lại)
TRUNCATE TABLE assessment_scores    RESTART IDENTITY CASCADE;
TRUNCATE TABLE assessment_summary   RESTART IDENTITY CASCADE;
TRUNCATE TABLE external_scores      RESTART IDENTITY CASCADE;
TRUNCATE TABLE employee_extras      RESTART IDENTITY CASCADE;
TRUNCATE TABLE career_roadmaps      RESTART IDENTITY CASCADE;
TRUNCATE TABLE idp_goals            RESTART IDENTITY CASCADE;
TRUNCATE TABLE idp_plans            RESTART IDENTITY CASCADE;
TRUNCATE TABLE succession_plans     RESTART IDENTITY CASCADE;
TRUNCATE TABLE mentoring_pairs      RESTART IDENTITY CASCADE;
TRUNCATE TABLE calibration_sessions RESTART IDENTITY CASCADE;

-- Xóa employees NGOẠI TRỪ 23 người
DELETE FROM employees
WHERE full_name NOT IN (
  'Chu Nhất Phương',
  'Dương Hữu Huyền',
  'Dương Ngọc Hạnh',
  'Huỳnh Thanh Chi',
  'Lê Gia Khôi',
  'Lê Hồng Lam',
  'Lê Thị Minh Hải',
  'Lý Quang Hân',
  'Nguyễn Ngọc Lan Oanh',
  'Nguyễn Ngọc Đoan Trinh',
  'Nguyễn Thị Phương Thảo',
  'Nguyễn Xuân Tuyến',
  'Ngọc Đỗ Đi Học 1',
  'Trần Ngọc Yến',
  'Trần Thế Nhân',
  'Tôn Trúc Thu',
  'Võ Ngọc Vinh',
  'Võ Thanh Sơn',
  'Võ Thị Ngọc Mai',
  'Vũ Gia Đan',
  'Vũ Ngọc Hạnh',
  'Vũ Trúc Thắng',
  'Đặng Khánh Hạnh'
);

-- Re-enable FK triggers
SET session_replication_role = 'origin';

-- Kiểm tra kết quả
SELECT COUNT(*) AS remaining_employees FROM employees;
SELECT full_name FROM employees ORDER BY full_name;
