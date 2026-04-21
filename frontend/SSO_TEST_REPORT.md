# SSO_TEST_REPORT.md
> Ngày test: 2026-04-21
> Môi trường: Angular 21 + Vitest 4 + jsdom

---

## Tổng kết

| Hạng mục        | Kết quả                    |
|-----------------|----------------------------|
| Build dev       | ✅ PASS (0 TS errors)       |
| Build prod      | ✅ PASS (0 TS errors)       |
| Route audit     | ✅ PASS                     |
| OidcService     | ✅ 16/16 passed             |
| AuthService     | ✅ 14/14 passed             |
| Callback review | ✅ 5/5 cases covered        |
| Silent refresh  | ✅ 4/4 checks passed        |
| **TỔNG**        | **30 tests PASSED, 0 FAILED** |

---

## TEST 1 — ng build

```
ng build             → Application bundle generation complete (0 errors)
ng build --production → Application bundle generation complete (0 errors)
```

**Warnings (không liên quan SSO — đã tồn tại từ trước):**
- `succession.component.scss` exceeds 20kB budget (+8.84kB)
- `talent-profile.component.scss` exceeds 20kB budget (+6.49kB)

---

## TEST 2 — Route audit

| Route             | Có authGuard? | Kết quả |
|-------------------|---------------|---------|
| `/login`          | ❌ Không       | ✅ Đúng |
| `/auth/callback`  | ❌ Không       | ✅ Đúng |
| `/logout`         | ❌ Không       | ✅ Đúng |
| `/silent-refresh` | ❌ Không       | ✅ Đúng |
| `/dashboard`      | ✅ Có (via `canActivateChild`) | ✅ Đúng |
| `/talent`         | ✅ Có          | ✅ Đúng |
| `/admin`          | ✅ Có          | ✅ Đúng |
| (tất cả children) | ✅ Có          | ✅ Đúng |

---

## TEST 3 — OidcService (16 tests PASSED)

| Test case | Kết quả |
|---|---|
| generateCodeVerifier dài 64+ ký tự | ✅ |
| generateCodeVerifier chỉ chứa ký tự base64url | ✅ |
| generateCodeVerifier khác nhau mỗi lần | ✅ |
| generateState khác nhau mỗi lần | ✅ |
| generateState chỉ chứa ký tự base64url | ✅ |
| saveOidcState + popOidcState round-trip | ✅ |
| popOidcState xóa keys sau khi đọc | ✅ |
| popOidcState trả về null nếu sessionStorage trống | ✅ |
| popOidcState trả về null nếu thiếu 1 key | ✅ |
| buildAuthorizeUrl chứa đủ 7 params bắt buộc | ✅ |
| buildAuthorizeUrl lưu oidc_state + oidc_verifier | ✅ |
| buildAuthorizeUrl trỏ đúng tới issuer /connect/authorize | ✅ |
| generateCodeChallenge trả về base64url hợp lệ | ✅ |
| generateCodeChallenge deterministic (cùng input → cùng output) | ✅ |
| generateCodeChallenge khác nhau với input khác nhau | ✅ |
| buildLogoutUrl trả về URL đúng | ✅ |

---

## TEST 4 — AuthService (14 tests PASSED)

| Test case | Kết quả |
|---|---|
| setOidcSession lưu access_token, refresh_token, id_token | ✅ |
| setOidcSession lưu token_expiry | ✅ |
| setOidcSession map VnrUserInfo → app user shape đúng | ✅ |
| setOidcSession với role array → lấy phần tử [0] | ✅ |
| setOidcSession với email undefined → email = '' | ✅ |
| setOidcSession → isAuthenticatedSnapshot() = true | ✅ |
| logout(false) clear 5 keys localStorage | ✅ |
| logout(false) KHÔNG gọi buildLogoutUrl | ✅ |
| isAuthenticatedSnapshot() = false sau logout | ✅ |
| logout(true) gọi buildLogoutUrl với id_token đúng | ✅ |
| logout(true) không có id_token → KHÔNG gọi buildLogoutUrl | ✅ |
| getToken() trả về access_token sau setOidcSession | ✅ |
| getCurrentUser() trả về app user shape | ✅ |
| getToken() = null sau logout | ✅ |

**Ghi chú:** Warning `"Not implemented: navigation to another Document"` từ jsdom khi `window.location.href` bị gán trong `logout(true)` — đây là hành vi bình thường của jsdom test environment, không phải lỗi.

---

## TEST 5 — OidcCallbackComponent (code review)

| Case | Được handle? | Vị trí |
|---|---|---|
| `?error=` trong URL → hiện message lỗi → navigate /login sau 3s | ✅ | dòng 37-40 |
| Thiếu `?code` hoặc `?state` → navigate /login sau 2s | ✅ | dòng 43-47 |
| `state` không khớp sessionStorage → navigate /login sau 3s | ✅ | dòng 50-54 |
| Happy path: exchangeCode → getUserInfo → setOidcSession → redirect | ✅ | dòng 57-69 |
| exchangeCode/getUserInfo throw → navigate /login sau 3s | ✅ | dòng 71-75 |

**Tất cả 5 case đều được handle đầy đủ.**

---

## TEST 6 — Silent Refresh (code review)

| Kiểm tra | Kết quả |
|---|---|
| `scheduleSilentRefresh` được gọi trong `setOidcSession` | ✅ dòng 101 |
| delay = `Math.max((expiresIn - 60) * 1000, 0)` | ✅ dòng 108 |
| refreshToken thành công → update localStorage + reschedule | ✅ dòng 116-122 |
| refreshToken fail → gọi `logout()` | ✅ dòng 123-125 |

---

## Không có lỗi nào cần fix

Tất cả 30 automated tests pass. Code review manual đầy đủ. SSO integration sẵn sàng test thực tế với VnR Identity Server.

---

## Bước tiếp theo (cần làm thủ công)

1. **Điền ClientSecret thật** vào environment khi VnR cấp (hiện đang dùng `'secret'`)
2. **Test end-to-end** với browser thật: click SSO button → VnR login page → callback → dashboard
3. **Verify CORS** từ VnR: `https://ba.vnresource.net:1516/connect/token` phải cho phép origin `http://localhost:4200`
4. **Xác nhận claims** trong id_token: đặc biệt field `name` và `role` phải có trong userinfo endpoint
