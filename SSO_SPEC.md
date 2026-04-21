# SSO Integration Spec — SuccessionOS × VnR Identity
> Paste toàn bộ file này vào Claude CLI.
> Flow: Authorization Code + PKCE (theo tài liệu VnR)
> Giữ nguyên mock login — thêm SSO song song

---

## CONTEXT

- Angular 18 standalone components, ng-zorro-antd
- `AuthService` đang có: `setSession(token, user)`, `logout()`, `getToken()`, `getCurrentUser()`
- `LoginComponent` đang có: mock credential check, `loginFake()`, `fillDemo()`
- SSR-safe: dùng `typeof window !== 'undefined'` trước mọi `localStorage`
- Base path frontend: `frontend/src/app/`

---

## TASK 1 — Cập nhật `environment.ts` và `environment.prod.ts`

File: `frontend/src/environments/environment.ts`

Thêm 2 field vào object hiện có (KHÔNG xóa field cũ):

```ts
export const environment = {
  // ... giữ nguyên apiUrl, useMock hiện có ...

  // App origin — dùng cho redirectUri OIDC
  appUrl: 'http://localhost:4200',

  // OIDC config VnR — điền sau khi nhận thông tin từ VnResource
  oidc: {
    issuer: 'https://<VNR_IDENTITY_ISSUER>',   // VD: https://identity.vnresource.vn
    clientId: '<VNR_CLIENT_ID>',
    scope: 'openid profile email roles offline_access',
    redirectUri: 'http://localhost:4200/auth/callback',
    postLogoutRedirectUri: 'http://localhost:4200/login',
    silentRefreshUri: 'http://localhost:4200/silent-refresh.html',
  },
};
```

File: `frontend/src/environments/environment.prod.ts`

```ts
  appUrl: 'https://successionos.vn',  // thay bằng domain thật
  oidc: {
    issuer: 'https://<VNR_IDENTITY_ISSUER_PROD>',
    clientId: '<VNR_CLIENT_ID_PROD>',
    scope: 'openid profile email roles offline_access',
    redirectUri: 'https://successionos.vn/auth/callback',
    postLogoutRedirectUri: 'https://successionos.vn/login',
    silentRefreshUri: 'https://successionos.vn/silent-refresh.html',
  },
```

---

## TASK 2 — Tạo `OidcService` (PKCE helper + token exchange)

Tạo file mới: `frontend/src/app/core/auth/oidc.service.ts`

Service này tách biệt hoàn toàn khỏi `AuthService` — chỉ lo PKCE + HTTP calls.

```ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface OidcTokenResponse {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export interface VnrUserInfo {
  sub: string;
  name: string;
  given_name: string;
  family_name: string;
  email?: string;
  role: string | string[];
}

@Injectable({ providedIn: 'root' })
export class OidcService {
  private readonly cfg = environment.oidc;

  constructor(private http: HttpClient) {}

  // ─── PKCE helpers ───────────────────────────────────────────

  /** Tạo code_verifier ngẫu nhiên (43-128 ký tự) */
  generateCodeVerifier(): string {
    const array = new Uint8Array(48);
    crypto.getRandomValues(array);
    return this.base64UrlEncode(array);
  }

  /** SHA-256 hash verifier → code_challenge */
  async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return this.base64UrlEncode(new Uint8Array(digest));
  }

  /** Tạo state ngẫu nhiên chống CSRF */
  generateState(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return this.base64UrlEncode(array);
  }

  private base64UrlEncode(buffer: Uint8Array): string {
    return btoa(String.fromCharCode(...buffer))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // ─── PKCE session storage ────────────────────────────────────
  // Dùng sessionStorage (không phải localStorage) — xóa sau khi dùng

  saveOidcState(state: string, verifier: string): void {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem('oidc_state', state);
    sessionStorage.setItem('oidc_verifier', verifier);
  }

  popOidcState(): { state: string; verifier: string } | null {
    if (typeof window === 'undefined') return null;
    const state    = sessionStorage.getItem('oidc_state');
    const verifier = sessionStorage.getItem('oidc_verifier');
    sessionStorage.removeItem('oidc_state');
    sessionStorage.removeItem('oidc_verifier');
    if (!state || !verifier) return null;
    return { state, verifier };
  }

  // ─── Build Authorization URL ─────────────────────────────────

  async buildAuthorizeUrl(): Promise<string> {
    const verifier   = this.generateCodeVerifier();
    const challenge  = await this.generateCodeChallenge(verifier);
    const state      = this.generateState();

    this.saveOidcState(state, verifier);

    const params = new URLSearchParams({
      response_type:          'code',
      client_id:              this.cfg.clientId,
      redirect_uri:           this.cfg.redirectUri,
      scope:                  this.cfg.scope,
      state,
      code_challenge:         challenge,
      code_challenge_method:  'S256',
    });

    return `${this.cfg.issuer}/connect/authorize?${params.toString()}`;
  }

  // ─── Exchange code → tokens ───────────────────────────────────

  exchangeCode(code: string, verifier: string): Promise<OidcTokenResponse> {
    const body = new HttpParams()
      .set('grant_type',     'authorization_code')
      .set('client_id',      this.cfg.clientId)
      .set('code',           code)
      .set('redirect_uri',   this.cfg.redirectUri)
      .set('code_verifier',  verifier);

    const headers = new HttpHeaders({
      'Content-Type': 'application/x-www-form-urlencoded',
    });

    return this.http
      .post<OidcTokenResponse>(`${this.cfg.issuer}/connect/token`, body.toString(), { headers })
      .toPromise() as Promise<OidcTokenResponse>;
  }

  // ─── Refresh token ────────────────────────────────────────────

  refreshToken(refreshToken: string): Promise<OidcTokenResponse> {
    const body = new HttpParams()
      .set('grant_type',    'refresh_token')
      .set('client_id',     this.cfg.clientId)
      .set('refresh_token', refreshToken);

    const headers = new HttpHeaders({
      'Content-Type': 'application/x-www-form-urlencoded',
    });

    return this.http
      .post<OidcTokenResponse>(`${this.cfg.issuer}/connect/token`, body.toString(), { headers })
      .toPromise() as Promise<OidcTokenResponse>;
  }

  // ─── UserInfo ─────────────────────────────────────────────────

  getUserInfo(accessToken: string): Promise<VnrUserInfo> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    return this.http
      .get<VnrUserInfo>(`${this.cfg.issuer}/connect/userinfo`, { headers })
      .toPromise() as Promise<VnrUserInfo>;
  }

  // ─── Logout URL ───────────────────────────────────────────────

  buildLogoutUrl(idToken: string): string {
    const params = new URLSearchParams({
      id_token_hint:            idToken,
      post_logout_redirect_uri: this.cfg.postLogoutRedirectUri,
    });
    return `${this.cfg.issuer}/connect/endsession?${params.toString()}`;
  }
}
```

---

## TASK 3 — Cập nhật `AuthService`

File: `frontend/src/app/core/auth/auth.service.ts`

**KHÔNG xóa** bất kỳ method nào hiện có. Chỉ thêm/sửa những phần sau:

### 3a. Thêm constants và field mới

```ts
// Thêm vào đầu class, sau TOKEN_KEY và USER_KEY:
private readonly REFRESH_TOKEN_KEY = 'refresh_token';
private readonly ID_TOKEN_KEY      = 'id_token';
private readonly TOKEN_EXPIRY_KEY  = 'token_expiry';
private silentRefreshTimer: ReturnType<typeof setTimeout> | null = null;
```

### 3b. Thêm method `setOidcSession()`

Method này được gọi từ `OidcCallbackComponent` sau khi exchange code thành công.

```ts
setOidcSession(tokens: OidcTokenResponse, user: VnrUserInfo): void {
  const ls = this.getLocalStorage();
  ls?.setItem(this.TOKEN_KEY,         tokens.access_token);
  ls?.setItem(this.REFRESH_TOKEN_KEY, tokens.refresh_token ?? '');
  ls?.setItem(this.ID_TOKEN_KEY,      tokens.id_token ?? '');

  // Lưu expiry timestamp (epoch ms) để schedule silent refresh
  const expiryMs = Date.now() + tokens.expires_in * 1000;
  ls?.setItem(this.TOKEN_EXPIRY_KEY, String(expiryMs));

  // Map VnrUserInfo → shape hiện tại của app
  const appUser = {
    id:       user.sub,
    email:    user.email ?? '',
    fullName: user.name,
    role:     Array.isArray(user.role) ? user.role[0] : user.role,
  };
  ls?.setItem(this.USER_KEY, JSON.stringify(appUser));
  this.isLoggedIn$.next(true);

  // Schedule silent refresh 60s trước khi hết hạn
  this.scheduleSilentRefresh(tokens.expires_in);
}
```

### 3c. Thêm method `scheduleSilentRefresh()`

```ts
private scheduleSilentRefresh(expiresIn: number): void {
  if (typeof window === 'undefined') return;
  if (this.silentRefreshTimer) clearTimeout(this.silentRefreshTimer);

  // Refresh trước 60 giây
  const delayMs = Math.max((expiresIn - 60) * 1000, 0);
  this.silentRefreshTimer = setTimeout(() => this.doSilentRefresh(), delayMs);
}

private doSilentRefresh(): void {
  const refreshToken = this.getLocalStorage()?.getItem(this.REFRESH_TOKEN_KEY);
  if (!refreshToken) return;

  // Inject OidcService — dùng dynamic import để tránh circular dependency
  import('./oidc.service').then(({ OidcService }) => {
    // NOTE: OidcService đã providedIn root, lấy instance qua injector
    // Claude CLI: inject OidcService vào constructor thay thế cách này nếu cần
    const oidcService = (window as any).__oidcServiceRef as OidcService | undefined;
    if (!oidcService) return;

    oidcService.refreshToken(refreshToken).then(tokens => {
      const ls = this.getLocalStorage();
      ls?.setItem(this.TOKEN_KEY,         tokens.access_token);
      ls?.setItem(this.REFRESH_TOKEN_KEY, tokens.refresh_token ?? refreshToken);
      const expiryMs = Date.now() + tokens.expires_in * 1000;
      ls?.setItem(this.TOKEN_EXPIRY_KEY, String(expiryMs));
      this.scheduleSilentRefresh(tokens.expires_in);
    }).catch(() => {
      // Refresh thất bại → logout
      this.logout();
    });
  });
}
```

> ⚠️ **Lưu ý cho Claude CLI:** Pattern `window.__oidcServiceRef` là workaround tạm thời tránh circular. Cách clean hơn: inject `OidcService` trực tiếp vào `AuthService` constructor — chỉ làm nếu KHÔNG có circular dependency (AuthService ↔ OidcService).

### 3d. Sửa method `logout()` — thêm SSO logout

```ts
logout(redirectToSso = false): void {
  if (this.silentRefreshTimer) clearTimeout(this.silentRefreshTimer);

  const idToken = this.getLocalStorage()?.getItem(this.ID_TOKEN_KEY) ?? '';
  const ls = this.getLocalStorage();
  ls?.removeItem(this.TOKEN_KEY);
  ls?.removeItem(this.REFRESH_TOKEN_KEY);
  ls?.removeItem(this.ID_TOKEN_KEY);
  ls?.removeItem(this.TOKEN_EXPIRY_KEY);
  ls?.removeItem(this.USER_KEY);
  this.isLoggedIn$.next(false);

  if (redirectToSso && idToken && typeof window !== 'undefined') {
    // Redirect sang VnR để xóa session SSO
    const params = new URLSearchParams({
      id_token_hint:            idToken,
      post_logout_redirect_uri: environment.oidc.postLogoutRedirectUri,
    });
    window.location.href = `${environment.oidc.issuer}/connect/endsession?${params.toString()}`;
  }
}
```

### 3e. Thêm import cần thiết ở đầu file

```ts
import { environment } from '../../../environments/environment';
import type { OidcTokenResponse, VnrUserInfo } from './oidc.service';
```

---

## TASK 4 — Tạo `OidcCallbackComponent`

Tạo file mới: `frontend/src/app/core/auth/oidc-callback/oidc-callback.component.ts`

Component này xử lý redirect từ VnR về sau khi user đăng nhập thành công.

```ts
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { AuthService } from '../auth.service';
import { OidcService } from '../oidc.service';

@Component({
  selector: 'app-oidc-callback',
  standalone: true,
  imports: [CommonModule, NzSpinModule],
  template: `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px;">
      <nz-spin nzSize="large" />
      <p style="color:#6B7280;font-size:14px;">{{ message }}</p>
    </div>
  `,
})
export class OidcCallbackComponent implements OnInit {
  message = 'Đang xác thực, vui lòng chờ...';

  constructor(
    private router: Router,
    private authService: AuthService,
    private oidcService: OidcService,
  ) {}

  async ngOnInit(): Promise<void> {
    if (typeof window === 'undefined') return;

    const params   = new URLSearchParams(window.location.search);
    const code     = params.get('code');
    const state    = params.get('state');
    const error    = params.get('error');

    // Lỗi từ VnR trả về
    if (error) {
      this.message = `Xác thực thất bại: ${params.get('error_description') ?? error}`;
      setTimeout(() => this.router.navigate(['/login']), 3000);
      return;
    }

    if (!code || !state) {
      this.message = 'Thiếu tham số xác thực.';
      setTimeout(() => this.router.navigate(['/login']), 2000);
      return;
    }

    // Lấy state + verifier đã lưu trong sessionStorage
    const saved = this.oidcService.popOidcState();
    if (!saved || saved.state !== state) {
      this.message = 'State không hợp lệ (CSRF protection). Vui lòng thử lại.';
      setTimeout(() => this.router.navigate(['/login']), 3000);
      return;
    }

    try {
      this.message = 'Đang lấy token...';
      const tokens = await this.oidcService.exchangeCode(code, saved.verifier);

      this.message = 'Đang tải thông tin người dùng...';
      const userInfo = await this.oidcService.getUserInfo(tokens.access_token);

      this.authService.setOidcSession(tokens, userInfo);

      // Redirect về trang người dùng đang vào, hoặc dashboard
      const redirectTo = sessionStorage.getItem('oidc_redirect') ?? '/dashboard';
      sessionStorage.removeItem('oidc_redirect');
      this.router.navigate([redirectTo]);

    } catch (err) {
      console.error('OIDC callback error:', err);
      this.message = 'Đăng nhập thất bại. Đang chuyển về trang đăng nhập...';
      setTimeout(() => this.router.navigate(['/login']), 3000);
    }
  }
}
```

---

## TASK 5 — Tạo `silent-refresh.html`

Tạo file: `frontend/public/silent-refresh.html`

File HTML tĩnh này được load trong iframe ẩn để refresh token mà không reload trang.

```html
<!DOCTYPE html>
<html>
<head><title>Silent Refresh</title></head>
<body>
<script>
  // Gửi kết quả refresh về parent window
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(
      { type: 'oidc_silent_refresh', url: window.location.href },
      window.location.origin
    );
  }
</script>
</body>
</html>
```

---

## TASK 6 — Thêm routes vào `app.routes.ts`

Tìm file `frontend/src/app/app.routes.ts`, thêm 2 route sau vào mảng routes **KHÔNG bảo vệ bởi authGuard**:

```ts
{
  path: 'auth/callback',
  loadComponent: () =>
    import('./core/auth/oidc-callback/oidc-callback.component')
      .then(m => m.OidcCallbackComponent),
},
{
  path: 'silent-refresh',
  // Route này không cần component — file HTML tĩnh tự xử lý
  // Giữ đây để Angular không 404 nếu có navigate nhầm
  redirectTo: '/',
},
```

---

## TASK 7 — Cập nhật `LoginComponent`

### 7a. `login.component.ts` — thêm `loginWithVnR()`

Thêm vào imports:
```ts
import { OidcService } from '../../../core/auth/oidc.service';
```

Inject vào constructor:
```ts
constructor(
  private authService: AuthService,
  private oidcService: OidcService,  // thêm
  private router: Router,
) {}
```

Thêm method mới (giữ nguyên `loginFake()` và mọi method khác):
```ts
async loginWithVnR(): Promise<void> {
  try {
    const url = await this.oidcService.buildAuthorizeUrl();
    if (typeof window !== 'undefined') {
      window.location.href = url;
    }
  } catch (err) {
    this.errorMsg.set('Không thể kết nối VnResource. Vui lòng thử lại.');
  }
}
```

### 7b. `login.component.html` — thêm SSO button

Tìm vị trí **ngay trước** thẻ `<div class="demo-hint">`, thêm đoạn sau:

```html
<!-- SSO Divider -->
<nz-divider nzText="hoặc" class="sso-divider"></nz-divider>

<!-- SSO Button -->
<button class="btn-sso" (click)="loginWithVnR()">
  <svg width="20" height="20" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="20" cy="14" r="5" fill="#4CAF50"/>
    <ellipse cx="13" cy="27" rx="5" ry="5" fill="#2E7D32"/>
    <ellipse cx="27" cy="27" rx="5" ry="5" fill="#2E7D32"/>
  </svg>
  <span>Đăng nhập qua HRM VnResource</span>
</button>
```

### 7c. `login.component.scss` — thêm styles cho SSO button

Thêm vào cuối file scss:

```scss
.sso-divider {
  margin: 16px 0 12px;
  color: var(--color-text-2, #6B7280);
  font-size: 12px;
}

.btn-sso {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 11px 20px;
  border: 1.5px solid #D1D5DB;
  border-radius: 10px;
  background: #fff;
  color: #374151;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 20px;

  &:hover {
    border-color: #4CAF50;
    background: #F0FDF4;
    color: #166534;
    box-shadow: 0 2px 8px rgba(76, 175, 80, 0.15);
  }

  &:active {
    transform: scale(0.98);
  }
}
```

---

## TASK 8 — Cập nhật `authGuard`

File: `frontend/src/app/core/guards/auth.guard.ts`

Thêm logic lưu URL đang cố truy cập trước khi redirect về login — để callback biết redirect về đâu sau SSO:

```ts
// Trong guard, trước khi return router.createUrlTree(['/login']):
if (typeof window !== 'undefined') {
  const currentUrl = state.url; // ActivatedRouteSnapshot state
  sessionStorage.setItem('oidc_redirect', currentUrl);
}
return router.createUrlTree(['/login']);
```

---

## CHECKLIST SAU KHI IMPLEMENT

Claude CLI kiểm tra từng mục sau khi xong:

- [ ] `ng build` không có lỗi TypeScript
- [ ] `http://localhost:4200/login` hiện nút "Đăng nhập qua HRM VnResource"
- [ ] Click nút SSO → redirect đến `<issuer>/connect/authorize?...` với đủ params: `response_type=code`, `code_challenge`, `code_challenge_method=S256`, `client_id`, `redirect_uri`, `scope`, `state`
- [ ] `sessionStorage` có `oidc_state` và `oidc_verifier` sau khi click
- [ ] Route `/auth/callback` tồn tại và không bị authGuard chặn
- [ ] Mock login (`admin/admin123`) vẫn hoạt động bình thường
- [ ] `logout()` không break — nhận optional param `redirectToSso`
- [ ] File `public/silent-refresh.html` tồn tại

---

## GHI CHÚ QUAN TRỌNG

1. **Chưa có ClientId/Issuer thật** — giữ placeholder `<VNR_CLIENT_ID>` và `<VNR_IDENTITY_ISSUER>` trong environment. SSO button sẽ redirect tới URL sai cho đến khi điền thật.

2. **Silent refresh với `window.__oidcServiceRef`** — đây là workaround. Nếu Claude CLI thấy cách clean hơn (inject `OidcService` vào `AuthService` constructor mà không circular), hãy dùng cách đó.

3. **`NzDividerModule`** — cần import vào `LoginComponent` imports array nếu chưa có.

4. **CORS** — khi gọi thật `/connect/token` và `/connect/userinfo`, VnR phải whitelist origin của app. Đây là việc của VnR setup — không cần code thêm.

5. **id_token lưu localStorage** — chỉ cần để build logout URL. Không dùng id_token để xác thực API call (dùng access_token).
