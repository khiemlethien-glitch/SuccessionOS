import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';
import { safeSessionStorage } from '../../utils/browser.utils';

@Component({
  selector: 'app-logout-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="display:flex;align-items:center;justify-content:center;
                height:100vh;flex-direction:column;gap:12px;">
      <span style="font-size:48px;">✓</span>
      <p style="font-size:16px;color:#374151;font-weight:500;">
        Đăng xuất thành công
      </p>
      <p style="font-size:13px;color:#6B7280;">
        Đang chuyển về trang đăng nhập...
      </p>
    </div>
  `,
})
export class LogoutCallbackComponent implements OnInit {
  constructor(
    private router: Router,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    // Clear còn sót (phòng trường hợp logout() chưa chạy)
    this.authService.logout(false);
    safeSessionStorage.clear();
    setTimeout(() => this.router.navigate(['/login']), 2000);
  }
}
