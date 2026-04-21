import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
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
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // Wrap trong Promise.resolve() để đẩy logic ra ngoài Angular change detection
    // cycle hiện tại — tránh lỗi NG0100 ExpressionChangedAfterChecked
    Promise.resolve().then(() => this.handleCallback());
  }

  private async handleCallback(): Promise<void> {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
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
      const redirectTo = sessionStorage.getItem('oidc_redirect') ?? '/dashboard';
      sessionStorage.removeItem('oidc_redirect');
      this.router.navigate([redirectTo]);

    } catch (err: any) {
      console.error('OIDC callback error:', {
        status:     err?.status,
        statusText: err?.statusText,
        error:      err?.error,
        url:        err?.url,
        message:    err?.message,
      });
      this.message = 'Đăng nhập thất bại. Đang chuyển về trang đăng nhập...';
      this.cdr.detectChanges();
      setTimeout(() => this.router.navigate(['/login']), 3000);
    }
  }
}
