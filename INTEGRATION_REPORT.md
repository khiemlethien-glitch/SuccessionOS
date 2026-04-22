# INTEGRATION_REPORT.md — SuccessionOS Frontend ↔ Backend

> Tự động append sau mỗi prompt backend.
> Cập nhật lần cuối: 2026-04-22 19:30

---

## Prompt 1 — EmployeeExtension + SyncService — 2026-04-22 10:16

| Endpoint | Method | Trạng thái | Frontend file | Ghi chú |
|---|---|---|---|---|
| `/api/v1/employees/sync` | POST | NOT_CONNECTED | — | Admin-only, trigger thủ công hoặc cron |
| `/api/v1/employees/{id}/scores` | PATCH | NOT_CONNECTED | — | Override manual, dùng trong Admin panel |

### Cần bổ sung frontend:

- [ ] `POST /api/v1/employees/sync` → **admin.component.ts** nên có nút "Đồng bộ dữ liệu VnR" gọi endpoint này → nhận `{ message, syncedAt }` → toast thành công
- [ ] `PATCH /api/v1/employees/{id}/scores` → **talent-profile.component.ts** hoặc **admin.component.ts** cần form "Ghi đè thủ công" → gọi `api.patch('employees/{id}/scores', payload)` khi HR muốn override score

> **Ghi chú**: 2 endpoint này là admin/operational — không có trong luồng user thường, nên việc chưa có frontend call là hợp lý. Sẽ hook vào Admin panel ở Prompt 3+ hoặc sau.

---

## Prompt 2 — Employee List + Detail — 2026-04-22 10:18

| Endpoint | Method | Trạng thái | Frontend file | Ghi chú |
|---|---|---|---|---|
| `/api/v1/employees` | GET | ✅ CONNECTED | `dashboard.component.ts` → ngOnInit | `api.get('employees','talents')` |
| `/api/v1/employees` | GET | ✅ CONNECTED | `talent-list.component.ts` → ngOnInit | `api.get('employees','talents')` |
| `/api/v1/employees` | GET | ✅ CONNECTED | `succession.component.ts` → ngOnInit | `api.get('employees','talents')` |
| `/api/v1/employees` | GET | ✅ CONNECTED | `talent-profile.component.ts` → line 465 | Lấy all để resolve colleagues |
| `/api/v1/employees/{id}` | GET | ✅ CONNECTED | `talent-profile.component.ts` → line 458 | `api.get('employees/${id}','talent-profile')` |
| `/api/v1/departments` | GET | NOT_CONNECTED | — | Frontend chưa gọi trực tiếp — lấy dept từ employee list |
| `/api/v1/employees/{id}/review` | GET | CONNECTED (mock) | `talent-profile.component.ts` → line 481 | Endpoint này **chưa có** trong backend — cần build Prompt 5+ |
| `/api/v1/employees/{id}/current-project` | GET | CONNECTED (mock) | `talent-profile.component.ts` → line 485 | **Chưa có** trong backend |
| `/api/v1/employees/{id}/knowledge-transfer` | GET | CONNECTED (mock) | `talent-profile.component.ts` → line 489 | **Chưa có** trong backend |

### ⚠️ Mapping quan trọng đã xử lý:

| Backend lưu | Frontend expect | Đã map trong `MapToDto` |
|---|---|---|
| `"Core"` | `"Nòng cốt"` | ✅ `MapTier()` |
| `"Potential"` | `"Tiềm năng"` | ✅ `MapTier()` |
| `"Successor"` | `"Kế thừa"` | ✅ `MapTier()` |
| `"1-2 Years"` | `"Ready in 1 Year"` | ✅ `MapReadiness()` |
| `"3+ Years"` | `"Ready in 2 Years"` | ✅ `MapReadiness()` |

### Cần bổ sung frontend (sau khi flip `useMock=false`):

- [ ] Khi flip `useMock=false`: `talent-profile.component.ts` gọi `employees/{id}/review`, `employees/{id}/current-project`, `employees/{id}/knowledge-transfer` sẽ 404 → cần build các endpoint phụ này hoặc bổ sung mock fallback

### Flip useMock → false (sau khi backend live):

```typescript
// frontend/src/environments/environment.ts
useMock: false   // ← đổi khi backend localhost:5000 đã run
```

---

## Prompt 3 — Key Positions + Succession Plans — 2026-04-22 10:52

| Endpoint | Method | Trạng thái | Frontend file | Ghi chú |
|---|---|---|---|---|
| `/api/v1/key-positions` | GET | ✅ CONNECTED | `dashboard.component.ts` → ngOnInit | `api.get('key-positions','positions')` |
| `/api/v1/key-positions` | GET | ✅ CONNECTED | `talent-list.component.ts` → ngOnInit | `api.get('key-positions','positions')` |
| `/api/v1/key-positions` | GET | ✅ CONNECTED | `positions.component.ts` → ngOnInit | `api.get('key-positions','positions')` |
| `/api/v1/key-positions` | GET | ✅ CONNECTED | `succession.component.ts` → ngOnInit | `api.get('key-positions','positions')` |
| `/api/v1/key-positions/{id}` | GET | NOT_CONNECTED | — | Chưa gọi từ frontend (detail load qua list) |
| `/api/v1/key-positions` | POST | NOT_CONNECTED | `positions.component.ts` → `submit()` | Hiện đang add local — cần hook vào `api.post('key-positions', ...)` |
| `/api/v1/key-positions/{id}` | PUT | NOT_CONNECTED | — | Chưa có edit UI |
| `/api/v1/key-positions/{id}` | DELETE | NOT_CONNECTED | — | Chưa có delete UI |
| `/api/v1/succession/plans` | GET | ✅ CONNECTED | `succession.component.ts` → ngOnInit | `api.get('succession/plans','succession-plans')` |
| `/api/v1/succession/plans` | GET | ✅ CONNECTED | `positions.component.ts` → ngOnInit | `api.get('succession/plans','succession-plans')` |
| `/api/v1/succession/plans` | GET | ✅ CONNECTED | `admin.component.ts` → ngOnInit | **Fixed**: path was `'succession-plans'` → corrected to `'succession/plans'` |
| `/api/v1/succession/plans/{id}` | GET | NOT_CONNECTED | — | Chưa có frontend gọi single plan |
| `/api/v1/succession/employee/{id}` | GET | NOT_CONNECTED | — | Chưa có frontend gọi |
| `/api/v1/succession/nine-box` | GET | NOT_CONNECTED | `succession.component.ts` | Nine-box hiện tính từ employees list — đủ dùng |
| `/api/v1/succession/plans` | POST | NOT_CONNECTED | — | Chưa có UI tạo plan |
| `/api/v1/succession/plans/{id}` | PUT | NOT_CONNECTED | — | Chưa có UI edit successors |

### Fix frontend đã áp dụng:
- ✅ `admin.component.ts` line 400: `'succession-plans'` → `'succession/plans'`

### Cần bổ sung frontend (để full CRUD hoạt động khi useMock=false):
- [ ] `positions.component.ts → submit()`: thay local add bằng `api.post('key-positions', payload).subscribe(...)` → nhận `201` → update list
- [ ] `positions.component.ts`: thêm nút "Xoá" → `api.delete('key-positions/{id}')` → soft delete
- [ ] `succession.component.ts`: thêm "Tạo/Sửa kế hoạch kế thừa" UI → `api.post/put('succession/plans', ...)`

---

## Prompt 4 — Dashboard KPI — 2026-04-22 10:55

| Endpoint | Method | Trạng thái | Frontend file | Ghi chú |
|---|---|---|---|---|
| `/api/v1/dashboard/kpi` | GET | ✅ CONNECTED | `dashboard.component.ts` → ngOnInit | Chỉ gọi khi `useMock=false`; mock dùng 3 calls riêng |

### Frontend đã cập nhật:
- ✅ `models.ts`: thêm `DashboardKpi` interface
- ✅ `dashboard.component.ts`: phân nhánh `useMock=false` → `api.get('dashboard/kpi')`, `useMock=true` → giữ 3 calls mock

### Cần bổ sung frontend (khi real data live):
- [ ] Khi `useMock=false`: `topRisk` trả `id + riskScore + riskReasons` — frontend cần resolve `fullName + position` từ employees list đã cached → thêm map logic trong `riskReason()` và `topRiskNow` computed

### Cache:
- Backend cache response 2 phút (`IMemoryCache`) — invalidate tự động, không cần manual flush

---

## Fix 404 — 5 Talent Profile Endpoints — 2026-04-22 19:30

### Vấn đề
Khi `useMock=false`, 5 endpoint trong `talent-profile.component.ts` trả 404 vì chưa có backend.

### Đã xử lý

#### Backend (mới hoàn toàn)
| Entity | File |
|---|---|
| `CareerReview` + `CareerCategory` | `Domain/Entities/CareerReview.cs` |
| `CurrentProject` | `Domain/Entities/CurrentProject.cs` |
| `KnowledgeTransfer` + `KtpItem` | `Domain/Entities/KnowledgeTransfer.cs` |
| `Assessment360` + sources/criteria | `Domain/Entities/Assessment360.cs` |
| `IdpPlanDetail` + `IdpGoal` | `Domain/Entities/IdpPlanDetail.cs` |

#### DbContext — 5 DbSets mới + JSON config
`SuccessionDbContext.cs` — thêm `CareerReviews`, `CurrentProjects`, `KnowledgeTransfers`, `Assessments360`, `IdpPlanDetails` với `OwnsMany/ToJson()` và `HasConversion` cho `List<string>`.

#### TalentProfileController — 5 GET + 1 PUT mới
| Endpoint | Method | Trạng thái | Frontend file |
|---|---|---|---|
| `/api/v1/employees/{id}/review` | GET | ✅ CONNECTED | `talent-profile.component.ts` → `loadCareerReview()` |
| `/api/v1/employees/{id}/current-project` | GET | ✅ CONNECTED | `talent-profile.component.ts` → `loadCurrentProject()` |
| `/api/v1/employees/{id}/knowledge-transfer` | GET | ✅ CONNECTED | `talent-profile.component.ts` → `loadKnowledgeTransfer()` |
| `/api/v1/assessments/{id}/latest` | GET | ✅ CONNECTED | `talent-profile.component.ts` → `loadAssessment360()` |
| `/api/v1/idp/{id}/employee` | GET | ✅ CONNECTED | `talent-profile.component.ts` → `loadIdp()` |
| `/api/v1/employees/{id}/review` | PUT | ✅ NEW | HR/Admin nhập/cập nhật career review |

#### Frontend graceful error handling
`talent-profile.component.ts` — 5 `*Loaded = signal<boolean | null>(null)` signals:
- `null` → skeleton/spinner
- `true` → hiển thị data
- `false` → empty state (lỗi/404)

### Build
- Backend: ✅ 0 lỗi 0 warning
- Frontend: ✅ 0 lỗi — `ng build` thành công, prerender 18 routes OK

### Lưu ý
- Các bảng mới rỗng — cần seed data qua `PUT /employees/{id}/review` hoặc seeder script
- `IdpPlanDetail` tách biệt với `IdpPlan` (summary) — chi tiết đầy đủ với goals list

---
