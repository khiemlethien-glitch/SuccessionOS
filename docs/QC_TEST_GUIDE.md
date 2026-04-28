# QC Test Guide — SuccessionOS
> Phiên bản: 2026-04-28 | Môi trường: Production (Vercel)

---

## 1. Thông tin môi trường

| Mục | Giá trị |
|---|---|
| URL | https://succession-os-y6mt.vercel.app |
| Database | Supabase PostgreSQL |
| Browser hỗ trợ | Chrome, Edge, Safari (desktop + mobile) |

### Tài khoản demo

| Email | Mật khẩu | Vai trò | Mô tả |
|---|---|---|---|
| `admin@ptsc.vn` | `Admin@123!` | Admin | Quyền cao nhất — thấy tất cả |
| `hr.manager@ptsc.vn` | `Hr@123!` | HR Manager | Thấy toàn công ty, không approve |
| `lm.kythuat@ptsc.vn` | `Lm@123!` | Line Manager | Chỉ thấy bộ phận kỹ thuật |
| `viewer@ptsc.vn` | `Viewer@123!` | Viewer (Nhân viên) | Chỉ thấy hồ sơ cá nhân |

---

## 2. Phân quyền (RBAC) — Tổng quan

Hệ thống có 4 vai trò theo thứ bậc: **Admin > HR Manager > Line Manager > Viewer**

### Ma trận hiển thị sidebar

| Tính năng (Sidebar) | Viewer | Line Manager | HR Manager | Admin |
|---|:---:|:---:|:---:|:---:|
| Hồ sơ của tôi (`/me`) | ✅ | ❌ | ❌ | ❌ |
| Dashboard | ❌ | ✅ | ✅ | ✅ |
| Nhân tài | ❌ | ✅ | ✅ | ✅ |
| Vị trí then chốt | ❌ | ✅ | ✅ | ✅ |
| Bản đồ kế thừa | ❌ | ✅ | ✅ | ✅ |
| Kèm cặp & Cố vấn | ✅ | ✅ | ✅ | ✅ |
| Quản trị | ❌ | ✅ | ✅ | ✅ |

### Ma trận quyền trong Admin Panel

| Tab Admin | Viewer | Line Manager | HR Manager | Admin |
|---|:---:|:---:|:---:|:---:|
| Phê duyệt (Approvals) | ❌ | ✅ xem + duyệt LM | ✅ xem tất cả (read-only) | ✅ duyệt tất cả |
| Audit Trail | ❌ | ❌ | ✅ | ✅ |
| Người dùng | ❌ | ❌ | ❌ | ✅ |
| Cấu hình | ❌ | ❌ | ❌ | ✅ |

---

## 3. Test Cases theo Module

---

### 3.1 Authentication — Đăng nhập / Đăng xuất

#### TC-AUTH-01: Đăng nhập thành công
- **Điều kiện:** Chưa đăng nhập
- **Thực hiện:** Nhập đúng email + mật khẩu → bấm "Đăng nhập"
- **Kết quả mong đợi:**
  - Admin/HR/LM → chuyển đến `/dashboard`
  - Viewer → chuyển đến `/talent/{employee_id}` (hồ sơ cá nhân)

#### TC-AUTH-02: Đăng nhập sai mật khẩu
- **Thực hiện:** Nhập sai mật khẩu
- **Kết quả mong đợi:** Hiện thông báo lỗi, không chuyển trang

#### TC-AUTH-03: Đăng xuất
- **Thực hiện:** Đăng nhập → bấm avatar góc dưới sidebar → "Đăng xuất"
- **Kết quả mong đợi:** Trở về trang login

#### TC-AUTH-04: Refresh trang khi đã đăng nhập
- **Thực hiện:** Đăng nhập thành công → F5 hoặc reload trang
- **Kết quả mong đợi:** Giữ nguyên trang hiện tại, KHÔNG văng ra login
- **⚠️ Note:** Bug này đã được fix (2026-04-28). Nếu vẫn văng → báo lỗi

---

### 3.2 Dashboard

#### TC-DASH-01: Truy cập Dashboard — Line Manager
- **Tài khoản:** `lm.kythuat@ptsc.vn`
- **Kết quả mong đợi:**
  - Chỉ thấy nhân viên trong bộ phận kỹ thuật
  - Số liệu tổng quan: tổng nhân tài, % sẵn sàng, v.v.

#### TC-DASH-02: Truy cập Dashboard — Admin/HR
- **Tài khoản:** `admin@ptsc.vn` hoặc `hr.manager@ptsc.vn`
- **Kết quả mong đợi:** Thấy toàn bộ công ty, không bị filter theo phòng ban

#### TC-DASH-03: Viewer không thấy Dashboard
- **Tài khoản:** `viewer@ptsc.vn`
- **Kết quả mong đợi:** Mục "Dashboard" KHÔNG xuất hiện trong sidebar

---

### 3.3 Danh sách Nhân tài (`/talent`)

#### TC-TALENT-01: Danh sách nhân tài — Line Manager
- **Tài khoản:** `lm.kythuat@ptsc.vn`
- **Kết quả mong đợi:**
  - Chỉ hiển thị nhân viên trong phòng ban kỹ thuật
  - Bộ lọc phòng ban bị khóa (locked)
  - 9-box grid chỉ có talent của phòng mình

#### TC-TALENT-02: Tìm kiếm nhân viên
- **Thực hiện:** Nhập tên vào ô tìm kiếm
- **Kết quả mong đợi:** Danh sách lọc real-time

#### TC-TALENT-03: Click vào nhân viên
- **Thực hiện:** Bấm vào tên/card một nhân viên
- **Kết quả mong đợi:** Mở trang hồ sơ nhân viên đó (`/talent/:id`)

#### TC-TALENT-04: Mobile — card layout
- **Thực hiện:** Dùng thiết bị mobile (hoặc DevTools responsive ≤ 768px)
- **Kết quả mong đợi:** Mỗi nhân viên hiển thị dạng card, không bị vỡ layout

---

### 3.4 Hồ sơ Nhân tài (`/talent/:id`)

Hồ sơ có 4 tab: **Năng lực | Phát triển | Kèm cặp | Rủi ro & Lịch sử**

#### TC-PROFILE-01: Xem hồ sơ (Line Manager/Admin/HR)
- **Kết quả mong đợi:**
  - Tab 1 Năng lực: radar chart, điểm năng lực, KPI
  - Tab 2 Phát triển: career roadmap, lộ trình AI
  - Tab 3 Kèm cặp: mentor hiện tại, link đến /mentoring
  - Tab 4 Rủi ro & Lịch sử: điểm rủi ro, lịch sử thay đổi

#### TC-PROFILE-02: Viewer xem hồ sơ của mình
- **Tài khoản:** `viewer@ptsc.vn`
- **Kết quả mong đợi:**
  - Thấy Tab 1, Tab 2, Tab 3 (Kèm cặp)
  - **KHÔNG thấy** Tab 4 (Rủi ro & Lịch sử)
  - **KHÔNG thấy** banner Rủi ro cao (nếu có)
  - **KHÔNG thấy** metric "Điểm rủi ro" trong hero

#### TC-PROFILE-03: Tab Kèm cặp trong hồ sơ
- **Kết quả mong đợi:**
  - Hiển thị mentor hiện tại (nếu có) hoặc "Chưa có mentor"
  - Có link "Quản lý kèm cặp →" dẫn đến `/mentoring`
  - **KHÔNG có** nút (+) thêm mentor trực tiếp từ đây

#### TC-PROFILE-04: AI Career Roadmap — Admin/HR/LM
- **Thực hiện:** Tab Phát triển → bấm "Tạo lộ trình AI"
- **Kết quả mong đợi:**
  - GPT-4o tạo lộ trình (có thể mất 5-15 giây)
  - Hiển thị roadmap theo từng giai đoạn
  - Nút "Xác nhận & Lưu" → lưu vào DB

#### TC-PROFILE-05: AI Career Roadmap — Viewer
- **Thực hiện:** Tab Phát triển → bấm "Tạo lộ trình AI"
- **Kết quả mong đợi:**
  - Thay nút "Xác nhận & Lưu" → nút "Gửi Phê Duyệt"
  - Sau khi gửi → hiện chip "Đã gửi · Chờ phê duyệt"

---

### 3.5 Vị trí Then chốt (`/positions`)

#### TC-POS-01: Xem danh sách vị trí
- **Kết quả mong đợi:** Danh sách vị trí then chốt, có thể lọc theo phòng ban

#### TC-POS-02: Click vào vị trí
- **Thực hiện:** Bấm vào một vị trí trong danh sách
- **Kết quả mong đợi:** Mở drawer (bên phải desktop / từ dưới mobile) → chi tiết vị trí + danh sách người kế thừa

#### TC-POS-03: Mobile — drawer từ dưới
- **Thực hiện:** Dùng mobile → bấm vào vị trí
- **Kết quả mong đợi:** Drawer trượt từ dưới lên (≥85vh), có drag handle

---

### 3.6 Bản đồ Kế thừa (`/succession`)

#### TC-SUCC-01: Xem org chart
- **Kết quả mong đợi:** Sơ đồ cây phân cấp tổ chức, có thể expand/collapse

#### TC-SUCC-02: Tab Mật độ kế thừa
- **Thực hiện:** Chuyển sang tab "Mật độ kế thừa"
- **Kết quả mong đợi:** Heat map hiển thị mật độ kế thừa theo phòng ban

#### TC-SUCC-03: Mobile — Mật độ kế thừa
- **Thực hiện:** Dùng mobile → tab Mật độ kế thừa
- **Kết quả mong đợi:**
  - Các hàng stack dọc, cells cuộn ngang
  - Bấm vào cell → bottom sheet từ dưới lên
  - Cột "Trung bình" ẩn để tiết kiệm màn hình

#### TC-SUCC-04: Click vào ô mật độ → xem talent
- **Thực hiện:** Bấm vào một ô trong heat map
- **Kết quả mong đợi:** Drawer mở ra, hiện danh sách nhân tài trong ô đó

---

### 3.7 Kèm Cặp & Cố Vấn (`/mentoring`)

> Module này mới hoàn chỉnh (2026-04-28). Cần test kỹ.

#### Trạng thái cặp kèm cặp
| Trạng thái DB | Hiển thị UI | Màu |
|---|---|---|
| `Active` | Đang kèm cặp | Xanh dương |
| `Completed` | Hoàn thành | Xanh lá |
| `PendingMentor` | Chờ Mentor | Vàng |
| `PendingLM` | Chờ LM duyệt | Cam |
| `PendingHR` | Chờ HR duyệt | Tím |
| `Rejected` | Đã từ chối | Đỏ |
| `Cancelled` | Đã hủy | Xám |
| `Paused` | Tạm dừng | Cyan |

#### TC-MENT-01: Viewer xem trang Kèm cặp
- **Tài khoản:** `viewer@ptsc.vn`
- **Kết quả mong đợi:**
  - Mục "Kèm cặp & Cố vấn" hiển thị trong sidebar
  - Vào `/mentoring` → thấy cặp kèm cặp của mình (nếu có)
  - Thấy 3 tab: "Đang kèm", "Chờ xử lý", "Lịch sử"

#### TC-MENT-02: Xem danh sách Active — Admin/HR
- **Tài khoản:** `admin@ptsc.vn`
- **Kết quả mong đợi:**
  - Tab "Đang kèm": 185 cặp trạng thái `Active`
  - Bấm vào cặp bất kỳ → detail panel bên phải hiển thị

#### TC-MENT-03: Xem lịch sử — Admin/HR
- **Tài khoản:** `admin@ptsc.vn`
- **Kết quả mong đợi:**
  - Tab "Lịch sử": 11 cặp trạng thái `Completed`
  - Hiển thị đúng tên mentor, mentee, thời gian

#### TC-MENT-04: Tạo cặp kèm cặp mới (4 bước)
- **Tài khoản:** `admin@ptsc.vn` hoặc `hr.manager@ptsc.vn`
- **Thực hiện:** Bấm nút "+" góc phải → drawer 4 bước mở ra
- **Bước 1:** Chọn mentee từ danh sách dropdown → "Tiếp theo"
- **Bước 2:** Chọn kỹ năng cần phát triển (từ đánh giá) → "Tiếp theo"
  - Nếu mentee chưa có dữ liệu đánh giá → hiện cảnh báo
- **Bước 3:** Chọn mentor được gợi ý (gap ≥ 15%)
  - Mỗi gợi ý hiển thị gap% theo từng kỹ năng
  - Mentor đang có mentee → bị ẩn khỏi danh sách
- **Bước 4:** Nhập mục tiêu, thời lượng, ghi chú → "Gửi yêu cầu"
- **Kết quả mong đợi:** Thành công → toast "Đã gửi yêu cầu kèm cặp thành công!"

#### TC-MENT-05: Luồng duyệt từ dưới lên (Mentee → Mentor → LM → HR)
- **Điều kiện:** Đã tạo cặp theo TC-MENT-04 với `initiated_by = mentee`
- **Bước 1 — Mentor nhận yêu cầu:**
  - Đăng nhập bằng tài khoản là mentor
  - Tab "Chờ xử lý" → thấy request `PendingMentor`
  - Bấm "Chấp nhận" → status → `PendingLM`
- **Bước 2 — LM duyệt:**
  - Đăng nhập `lm.kythuat@ptsc.vn`
  - Tab "Chờ xử lý" → thấy request `PendingLM`
  - Bấm "Phê duyệt" → status → `PendingHR`
- **Bước 3 — HR duyệt:**
  - Đăng nhập `hr.manager@ptsc.vn`
  - Tab "Chờ xử lý" → thấy request `PendingHR`
  - Bấm "Phê duyệt" → status → `Active`
- **Kết quả cuối:** Cặp xuất hiện ở tab "Đang kèm" với trạng thái xanh dương

#### TC-MENT-06: Mentor từ chối
- **Điều kiện:** Có cặp ở trạng thái `PendingMentor`
- **Thực hiện:** Đăng nhập mentor → bấm "Từ chối" → nhập lý do → xác nhận
- **Kết quả mong đợi:** Status → `Rejected`, hiển thị ở tab "Lịch sử"

#### TC-MENT-07: Ghi nhận buổi kèm cặp (Log session)
- **Điều kiện:** Có cặp `Active`, đăng nhập bằng tài khoản mentee
- **Thực hiện:** Chọn cặp → bấm "Ghi nhận buổi học" → nhập ngày, thời lượng, tiêu đề, ghi chú → "Lưu"
- **Kết quả mong đợi:** Buổi học xuất hiện trong timeline bên phải, trạng thái "Chờ xác nhận"

#### TC-MENT-08: Mentor xác nhận buổi học
- **Điều kiện:** Có buổi học "Chờ xác nhận"
- **Thực hiện:** Đăng nhập mentor → chọn cặp → bấm "Xác nhận" trên buổi học → nhập nhận xét → "Lưu"
- **Kết quả mong đợi:** Status buổi học → "Đã xác nhận" (màu xanh), giờ được cộng vào tiến độ

#### TC-MENT-09: Thanh tiến độ cặp kèm cặp
- **Thực hiện:** Xem detail panel của cặp `Active`
- **Kết quả mong đợi:**
  - `x / y giờ` (giờ đã xác nhận / tổng kế hoạch)
  - Thanh progress bar cập nhật theo giờ thực tế
  - Nhãn: "Xuất sắc" (≥80%), "Đúng tiến độ" (≥50%), "Cần tăng tốc" (<50%)

---

### 3.8 Quản trị — Admin Panel (`/admin`)

#### TC-ADMIN-01: Tab Phê duyệt — Line Manager
- **Tài khoản:** `lm.kythuat@ptsc.vn`
- **Kết quả mong đợi:**
  - Chỉ thấy requests giao cho mình (approver_id = user_id của mình)
  - Có thể approve/reject các request ở bước LM

#### TC-ADMIN-02: Tab Phê duyệt — HR Manager
- **Tài khoản:** `hr.manager@ptsc.vn`
- **Kết quả mong đợi:**
  - Thấy TẤT CẢ requests (không bị filter phòng ban)
  - Có chip "Chế độ xem — không thể phê duyệt" (HR read-only trong bảng phê duyệt chung)

#### TC-ADMIN-03: Tab Phê duyệt — Admin
- **Tài khoản:** `admin@ptsc.vn`
- **Kết quả mong đợi:**
  - Thấy tất cả, có thể approve bước Admin (bước cuối)

#### TC-ADMIN-04: Tab Audit Trail — chỉ HR/Admin
- **Tài khoản:** `lm.kythuat@ptsc.vn`
- **Kết quả mong đợi:** Tab "Audit Trail" **KHÔNG hiển thị**

#### TC-ADMIN-05: Tab Audit Trail — HR/Admin
- **Kết quả mong đợi:** Thấy lịch sử hoạt động hệ thống (ai làm gì, lúc nào)

#### TC-ADMIN-06: Tab Người dùng — chỉ Admin
- **Tài khoản:** `hr.manager@ptsc.vn`
- **Kết quả mong đợi:** Tab "Người dùng" **KHÔNG hiển thị**

#### TC-ADMIN-07: Approval workflow — Viewer tạo AI Roadmap
- **Tài khoản:** `viewer@ptsc.vn`
- **Thực hiện:** Profile → Tab Phát triển → Tạo roadmap → "Gửi Phê Duyệt"
- **Kết quả đầu:** Viewer thấy chip "Đã gửi · Chờ phê duyệt"
- **Kiểm tra Admin panel:** `lm.kythuat@ptsc.vn` → Admin → thấy request mới type `career_roadmap`

---

## 4. Lỗi đã biết / Hạn chế hiện tại

| # | Mô tả | Nghiêm trọng | Workaround |
|---|---|---|---|
| 1 | **Không có route guard** — Viewer biết URL `/talent/xxx` vẫn vào được trực tiếp | Trung bình | Chưa có — chỉ ẩn sidebar |
| 2 | **HR Manager không approve được** — đây là thiết kế cố ý (read-only) | Thấp | Dùng Admin để approve |
| 3 | **Mentoring: mentee chưa có assessment** → bước 2 tạo cặp hiện cảnh báo, không suggest mentor được | Thấp | Cần nhập assessment scores trước |
| 4 | **Mobile: một số drawer** có thể overflow nếu content quá dài | Thấp | Scroll trong drawer |
| 5 | **Viewer redirect `/me`** — cần `employee_id` đã được gán trong user_profiles | Trung bình | Nếu redirect fail → vào trực tiếp `/talent/:id` |

---

## 5. Luồng Approval — Tham khảo nhanh

```
Người gửi       Bước duyệt (tuần tự)
──────────────────────────────────────────────────
Admin           → Tự động approved (không cần duyệt)
HR Manager      → [Admin]
Line Manager    → [HR Manager → Admin]
Viewer          → [Line Manager → Admin]
Mentor request  → [Line Manager → HR Manager]
```

> **Lưu ý:** Bước sau chỉ mở sau khi bước trước đã `approved`.
> HR Manager là bước BẮT BUỘC trong mọi flow ngoại trừ Admin tự gửi và HR gửi cho Admin.

---

## 6. Checklist QC nhanh (Smoke Test)

Chạy nhanh 15 phút để xác nhận app hoạt động cơ bản:

- [ ] Login 4 tài khoản thành công
- [ ] Viewer redirect về hồ sơ cá nhân (không phải dashboard)
- [ ] Viewer không thấy Dashboard/Nhân tài/Bản đồ trong sidebar
- [ ] Viewer thấy mục "Kèm cặp & Cố vấn" trong sidebar
- [ ] F5 sau khi đăng nhập không văng ra login
- [ ] LM chỉ thấy nhân viên bộ phận mình
- [ ] Admin thấy 185 cặp Active + 11 cặp Completed trong `/mentoring`
- [ ] Bấm vào cặp kèm cặp → detail panel hiển thị bên phải
- [ ] Tab "Rủi ro" trong hồ sơ: Viewer không thấy, LM/HR/Admin thấy
- [ ] Admin panel: LM không thấy tab Audit/Users/Settings

---

*Tài liệu này được tạo tự động từ codebase. Cập nhật lần cuối: 2026-04-28.*
