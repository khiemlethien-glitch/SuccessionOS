-- =============================================================================
-- Seed: Demo users cho môi trường dev/staging
--
-- CÁCH CHẠY:
--   1. Vào Supabase Dashboard → Authentication → Users → "Invite user" hoặc
--      dùng Supabase CLI:
--
--   supabase auth create-user --email admin@ptsc.vn       --password 'Admin@123!'
--   supabase auth create-user --email hr.manager@ptsc.vn  --password 'Hr@123!'
--   supabase auth create-user --email lm.kythuat@ptsc.vn  --password 'Lm@123!'
--   supabase auth create-user --email viewer@ptsc.vn      --password 'Viewer@123!'
--
--   2. Sau khi tạo user, lấy UUID của từng user từ:
--      Authentication → Users → copy "User ID"
--
--   3. Thay các UUID placeholder bên dưới, rồi chạy SQL này
--      trong SQL Editor của Supabase Dashboard.
--
-- ⚠️  KHÔNG commit file này với mật khẩu thật vào repo production.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Tạo user_profiles cho demo accounts
-- Thay 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' bằng UUID thật từ Auth Dashboard
-- ─────────────────────────────────────────────────────────────────────────────

-- Trước khi chạy: kiểm tra cột thực tế của bảng
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'user_profiles';

INSERT INTO user_profiles (id, email, full_name, role)
VALUES
  (
    'aaaaaaaa-0000-0000-0000-000000000001',  -- ← Thay bằng UUID của admin@ptsc.vn
    'admin@ptsc.vn',
    'Nguyễn Quản Trị',
    'Admin'
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000002',  -- ← Thay bằng UUID của hr.manager@ptsc.vn
    'hr.manager@ptsc.vn',
    'Trần HR Manager',
    'HR Manager'
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000003',  -- ← Thay bằng UUID của lm.kythuat@ptsc.vn
    'lm.kythuat@ptsc.vn',
    'Lê Line Manager Kỹ Thuật',
    'Line Manager'
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000004',  -- ← Thay bằng UUID của viewer@ptsc.vn
    'viewer@ptsc.vn',
    'Phạm Viewer',
    'Viewer'
  )
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role      = EXCLUDED.role;


-- =============================================================================
-- Role permissions reference (chỉ để tham khảo, không chạy)
-- =============================================================================
-- Admin       → toàn quyền: xem, sửa, xóa, cấu hình hệ thống
-- HR Manager  → xem tất cả nhân viên, kế thừa, IDP; sửa/tạo succession plans
-- Line Manager→ xem nhân sự thuộc phòng mình; xem lộ trình, IDP của team
-- Viewer      → chỉ đọc báo cáo và dashboard tổng quan


-- =============================================================================
-- Kiểm tra sau khi seed
-- =============================================================================
-- SELECT id, email, full_name, role FROM user_profiles ORDER BY role;
