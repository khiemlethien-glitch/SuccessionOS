# API Contract: Tích hợp Kết quả 360°

> Tài liệu này dành cho **backend team** và **nhà tích hợp hệ thống 360°** bên ngoài.

## Kiến trúc

```
Hệ thống 360° bên ngoài
    │  POST /api/v1/external/360-scores
    ▼
Backend (.NET 8)
    │  Lưu vào bảng external_scores
    ▼
Frontend (Angular 18)
    │  Đọc & hiển thị trong hồ sơ nhân viên (tab Điểm số + card 360°)
    ▼
Điểm tổng hợp = assessment_score × w₁ + score_360 × w₂
                (trọng số cấu hình trong Admin → Cấu hình)
```

**Không có nhập tay từ phía frontend.** Frontend chỉ hiển thị, không chỉnh sửa điểm 360°.

---

## Endpoint

```
POST /api/v1/external/360-scores
```

### Headers

| Header        | Giá trị                          | Bắt buộc |
|---------------|----------------------------------|----------|
| Content-Type  | `application/json`               | ✅       |
| X-Api-Key     | `<api_key>` cấp bởi admin        | ✅       |

### Request body

```json
{
  "employee_id": "E001",
  "cycle_id":    "2025-Annual",
  "score_360":   82.5,
  "criteria": [
    { "label": "Lãnh đạo",               "score": 4.2 },
    { "label": "Giao tiếp",              "score": 4.5 },
    { "label": "Kỹ năng làm việc nhóm",  "score": 3.9 },
    { "label": "Tư duy chiến lược",       "score": 4.0 },
    { "label": "Giải quyết vấn đề",       "score": 4.1 },
    { "label": "Tư duy phân tích",        "score": 3.8 },
    { "label": "Định hướng kết quả",      "score": 4.3 },
    { "label": "Quản lý thời gian",       "score": 3.7 }
  ]
}
```

> **Ghi chú:** `criteria` có thể chứa từ 1 đến 15 tiêu chí. Frontend hiển thị 5 tiêu chí đầu và cho phép người dùng mở rộng xem toàn bộ.

| Field        | Kiểu        | Mô tả                                              |
|--------------|-------------|----------------------------------------------------|
| employee_id  | string      | Mã nhân viên — khớp với `v_employees.id`           |
| cycle_id     | string      | Mã chu kỳ — khớp với `assessment_cycles.id`        |
| score_360    | number(0–100) | Điểm 360° cuối cùng (đã tính trọng số rater)     |
| criteria     | array       | Tuỳ chọn — danh sách tiêu chí (tối đa 15)         |
| criteria[].label | string  | Tên tiêu chí                                       |
| criteria[].score | number(0–5) | Điểm tiêu chí (thang 5)                       |

### Response

**200 OK — Thành công**
```json
{
  "success": true,
  "employee_id": "E001",
  "cycle_id":    "2025-Annual",
  "score_360":   82.5,
  "total_score": 72.5,
  "message":     "Score recorded successfully"
}
```

**400 Bad Request — Dữ liệu không hợp lệ**
```json
{ "error": "Invalid employee_id or cycle_id" }
```

**401 Unauthorized — API key sai**
```json
{ "error": "Unauthorized" }
```

---

## Lưu trữ (backend)

Backend lưu vào bảng `external_scores`:

```sql
CREATE TABLE external_scores (
  employee_id      TEXT NOT NULL,
  cycle_id         TEXT NOT NULL,
  assessment_score NUMERIC(6,2),  -- do frontend nhập riêng
  score_360        NUMERIC(6,2),  -- do hệ thống 360° push qua API này
  criteria_json    JSONB,          -- criteria[] từ request body
  updated_at       TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (employee_id, cycle_id)
);
```

Khi nhận được request:
1. `UPSERT` vào `external_scores` theo `(employee_id, cycle_id)` — chỉ cập nhật `score_360` và `criteria_json`, giữ nguyên `assessment_score`.
2. Tính `total_score = assessment_score × (w₁/100) + score_360 × (w₂/100)` từ bảng `score_weight_config`.
3. Trả response 200 với `total_score`.

---

## Công thức điểm tổng hợp

```
total_score = (assessment_score × assessment_weight / 100)
            + (score_360        × weight_360        / 100)
```

Trọng số `assessment_weight` và `weight_360` được cấu hình trong **Admin → Cấu hình → Trọng số điểm tổng hợp** và lưu trong bảng `score_weight_config (id=1)`.

---

## Chu kỳ đánh giá hợp lệ

`cycle_id` phải là một trong các giá trị trong bảng `assessment_cycles`. Ví dụ:
- `"2024-Annual"` — Đánh giá năm 2024
- `"2025-Annual"` — Đánh giá năm 2025
- `"2025-H1"` — Đánh giá 6 tháng đầu 2025

Nếu `cycle_id` không tồn tại → backend trả `400 Bad Request`.

---

## Endpoint KPI (POST assessment_score)

Nếu hệ thống KPI cũng push dữ liệu:

```
POST /api/v1/external/kpi-scores
```

```json
{
  "employee_id": "E001",
  "cycle_id":    "2025-Annual",
  "assessment_score": 85.0,
  "criteria": [
    { "label": "Hiệu suất công việc",   "score": 87 },
    { "label": "Chất lượng đầu ra",     "score": 82 },
    { "label": "Kỹ năng chuyên môn",    "score": 90 }
  ]
}
```

Backend lưu vào `external_scores.assessment_score` và `assessment_criteria` (type='kpi').  
Frontend tự động hiển thị cột **KPI** bên cạnh cột **360°** trong card Đánh giá năng lực.

---

## Hiển thị trong Frontend

### Logic hiển thị card Đánh giá năng lực

| Dữ liệu có sẵn | Bố cục |
|---|---|
| Chỉ KPI | 1 cột, nhãn "100% trọng số" |
| Chỉ 360° | 1 cột, nhãn "100% trọng số" |
| Cả KPI + 360° | 2 cột + hàng "Điểm tổng hợp" ở cuối |

- Hiển thị **5 tiêu chí đầu**, nút "Xem thêm (N)" để mở rộng toàn bộ
- Điểm KPI hiển thị thang **0–100**, điểm tiêu chí 360° hiển thị thang **0–5**
- Điểm tổng hợp = `assessment_score × w₁/100 + score_360 × w₂/100` (trọng số từ Admin)

### Các phần khác trong hồ sơ nhân viên
- **Tab "Điểm số"**: 3 card — Đánh giá năng lực / Điểm 360° / Điểm tổng hợp
- **Card "Kết quả đánh giá 360°"**: hiển thị `score_360` và toàn bộ `criteria_json`

Nếu chưa có dữ liệu 360° → frontend hiển thị trạng thái "Chờ đồng bộ từ hệ thống 360°".

---

## Cấu hình trong Admin

Admin có thể cấu hình trong **trang Admin → Cấu hình**:
- **Endpoint nhận điểm 360°**: URL mà hệ thống bên ngoài sẽ gọi
- **Trọng số**: `w₁` (assessment) + `w₂` (360°) — tổng phải bằng 100%
- **Tiêu chí hiển thị**: Drag-drop tối đa 4 tiêu chí trong tab "Đánh giá năng lực"
