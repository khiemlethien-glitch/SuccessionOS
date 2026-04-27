-- =============================================================================
-- Demo Users Setup — chạy theo thứ tự 2 bước bên dưới
-- =============================================================================

-- ══ BƯỚC 1: Thêm cột employee_id vào user_profiles (chỉ cần chạy 1 lần) ══════
-- employees.id là kiểu text → dùng text, không dùng uuid + foreign key
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS employee_id text;


-- ══ BƯỚC 2: Upsert 4 demo accounts ══════════════════════════════════════════
-- Script tự động lấy UUID từ auth.users và employee_id từ employees.
-- Chỉ cần đảm bảo 4 auth users đã được tạo với đúng email.

DO $$
DECLARE
  v_admin_id  uuid;
  v_hr_id     uuid;
  v_lm_id     uuid;
  v_viewer_id uuid;

  -- Lấy 4 nhân viên thật từ bảng employees (employees.id là text)
  v_emp_admin  text;
  v_emp_hr     text;
  v_emp_lm     text;
  v_emp_viewer text;

  v_emp_admin_name  text;
  v_emp_hr_name     text;
  v_emp_lm_name     text;
  v_emp_viewer_name text;
BEGIN
  -- Lấy UUID của các auth users
  SELECT id INTO v_admin_id  FROM auth.users WHERE email = 'admin@ptsc.vn'      LIMIT 1;
  SELECT id INTO v_hr_id     FROM auth.users WHERE email = 'hr.manager@ptsc.vn' LIMIT 1;
  SELECT id INTO v_lm_id     FROM auth.users WHERE email = 'lm.kythuat@ptsc.vn' LIMIT 1;
  SELECT id INTO v_viewer_id FROM auth.users WHERE email = 'viewer@ptsc.vn'     LIMIT 1;

  -- Lấy 4 employees thật (offset khác nhau để không trùng)
  SELECT id, full_name INTO v_emp_admin,  v_emp_admin_name  FROM employees ORDER BY full_name LIMIT 1 OFFSET 0;
  SELECT id, full_name INTO v_emp_hr,     v_emp_hr_name     FROM employees ORDER BY full_name LIMIT 1 OFFSET 1;
  SELECT id, full_name INTO v_emp_lm,     v_emp_lm_name     FROM employees ORDER BY full_name LIMIT 1 OFFSET 2;
  SELECT id, full_name INTO v_emp_viewer, v_emp_viewer_name FROM employees ORDER BY full_name LIMIT 1 OFFSET 3;

  -- Kiểm tra auth users tồn tại
  IF v_admin_id IS NULL THEN RAISE NOTICE 'Chưa tạo auth user: admin@ptsc.vn'; END IF;
  IF v_hr_id    IS NULL THEN RAISE NOTICE 'Chưa tạo auth user: hr.manager@ptsc.vn'; END IF;
  IF v_lm_id    IS NULL THEN RAISE NOTICE 'Chưa tạo auth user: lm.kythuat@ptsc.vn'; END IF;
  IF v_viewer_id IS NULL THEN RAISE NOTICE 'Chưa tạo auth user: viewer@ptsc.vn'; END IF;

  -- Insert / Update user_profiles
  IF v_admin_id IS NOT NULL THEN
    INSERT INTO user_profiles (id, email, full_name, role, employee_id)
    VALUES (v_admin_id, 'admin@ptsc.vn', v_emp_admin_name, 'Admin'::user_role, v_emp_admin)
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name, role = EXCLUDED.role, employee_id = EXCLUDED.employee_id;
  END IF;

  IF v_hr_id IS NOT NULL THEN
    INSERT INTO user_profiles (id, email, full_name, role, employee_id)
    VALUES (v_hr_id, 'hr.manager@ptsc.vn', v_emp_hr_name, 'HR Manager'::user_role, v_emp_hr)
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name, role = EXCLUDED.role, employee_id = EXCLUDED.employee_id;
  END IF;

  IF v_lm_id IS NOT NULL THEN
    INSERT INTO user_profiles (id, email, full_name, role, employee_id)
    VALUES (v_lm_id, 'lm.kythuat@ptsc.vn', v_emp_lm_name, 'Line Manager'::user_role, v_emp_lm)
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name, role = EXCLUDED.role, employee_id = EXCLUDED.employee_id;
  END IF;

  IF v_viewer_id IS NOT NULL THEN
    INSERT INTO user_profiles (id, email, full_name, role, employee_id)
    VALUES (v_viewer_id, 'viewer@ptsc.vn', v_emp_viewer_name, 'Viewer'::user_role, v_emp_viewer)
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name, role = EXCLUDED.role, employee_id = EXCLUDED.employee_id;
  END IF;

  RAISE NOTICE 'Done. Admin=%, HR=%, LM=%, Viewer=%',
    v_emp_admin_name, v_emp_hr_name, v_emp_lm_name, v_emp_viewer_name;
END $$;


-- ══ VERIFY: Kiểm tra kết quả ══════════════════════════════════════════════════
SELECT
  up.email,
  up.full_name,
  up.role,
  e.full_name  AS employee_name,
  e.department,
  e.position
FROM user_profiles up
LEFT JOIN employees e ON e.id = up.employee_id
WHERE up.email IN ('admin@ptsc.vn','hr.manager@ptsc.vn','lm.kythuat@ptsc.vn','viewer@ptsc.vn')
ORDER BY up.role;
