import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { AuthService } from '../auth.service';
import { OidcService } from '../oidc.service';
import { safeSessionStorage, safeLocationSearch, isBrowser } from '../../utils/browser.utils';

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
  // One-shot guard. `ngOnInit` can fire more than once when the prerendered
  // shell is hydrated client-side, and popOidcState() destructively
  // removes the PKCE entries from sessionStorage — so the second run used
  // to fail with "State không hợp lệ (CSRF protection)". This flag makes
  // sure handleCallback runs at most once per page load.
  private static handled = false;

  constructor(
    private router: Router,
    private authService: AuthService,
    private oidcService: OidcService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    if (!isBrowser()) return;              // SSR — skip entirely
    if (OidcCallbackComponent.handled) return;   // already ran this page load
    OidcCallbackComponent.handled = true;
    Promise.resolve().then(() => this.handleCallback());
  }

  private async handleCallback(): Promise<void> {
    if (!isBrowser()) return;

    const params = new URLSearchParams(safeLocationSearch());
    const code   = params.get('code');
    const state  = params.get('state');
    const error  = params.get('error');

    // Lỗi từ VnR trả về
    if (error) {
      this.message = `Xác thực thất bại: ${params.get('error_description') ?? error}`;
      this.cdr.detectChanges();
      setTimeout(() => this.router.navigate(['/login']), 3000);
      return;
    }

    if (!code || !state) {
      this.message = 'Thiếu tham số xác thực.';
      this.cdr.detectChanges();
      setTimeout(() => this.router.navigate(['/login']), 2000);
      return;
    }

    // Lấy state + verifier đã lưu trong sessionStorage
    const saved = this.oidcService.popOidcState();
    if (!saved || saved.state !== state) {
      this.message = 'State không hợp lệ (CSRF protection). Vui lòng thử lại.';
      this.cdr.detectChanges();
      setTimeout(() => this.router.navigate(['/login']), 3000);
      return;
    }

    try {
      this.message = 'Đang lấy token...';
      this.cdr.detectChanges();
      const tokens = await this.oidcService.exchangeCode(code, saved.verifier);

      this.message = 'Đang tải thông tin người dùng...';
      this.cdr.detectChanges();
      const userInfo = await this.oidcService.getUserInfo(tokens.access_token);

      this.authService.setOidcSession(tokens, userInfo);

      // Redirect về trang người dùng đang vào, hoặc dashboard
      const redirectTo = safeSessionStorage.getItem('oidc_redirect') ?? '/dashboard';
      safeSessionStorage.removeItem('oidc_redirect');
      this.router.navigate([redirectTo]);

    } catch (err: any) {
      // Stringify error.error explicitly so nested object contents show up
      // in console (devtools sometimes collapses `error: {...}`).
      const body = err?.error;
      const bodyStr = typeof body === 'string'
        ? body
        : (() => { try { return JSON.stringify(body, null, 2); } catch { return String(body); } })();

      console.error('OIDC callback error — full body:\n' + bodyStr);
      console.error('OIDC callback error — meta:', {
        status:     err?.status,
        statusText: err?.statusText,
        url:        err?.url,
        message:    err?.message,
      });

      // Pull standardized OAuth error fields if present, else show raw body.
      const code  = body?.error ?? err?.status ?? 'unknown';
      const desc  = body?.error_description ?? err?.message ?? bodyStr?.slice(0, 200);
      this.message = `Đăng nhập thất bại [${code}]: ${desc}`;
      this.cdr.detectChanges();
      setTimeout(() => this.router.navigate(['/login']), 8000);
    }
  }
}
