import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { AuthService } from '../../../core/auth/auth.service';

export interface DemoAccount {
  label:    string;   // hiển thị
  email:    string;   // đăng nhập Supabase Auth
  username: string;   // hiển thị ngắn gọn trong chip
  password: string;
  role:     string;   // tên role
  color:    'indigo' | 'blue' | 'green' | 'gray';
  icon:     string;   // ant-design icon type
  perms:    string;   // mô tả ngắn về quyền
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    NzInputModule, NzIconModule, NzButtonModule, NzDividerModule,
    NzSpinModule, NzTooltipModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  email        = signal('');
  password     = signal('');
  showPassword = signal(false);
  errorMsg     = signal('');
  loading      = signal(false);
  activeDemo   = signal<string | null>(null);   // email của chip đang login

  private returnUrl = '/dashboard';

  /** Viewer → /talent/:employee_id, others → returnUrl (default: /dashboard) */
  private navigateAfterLogin(): void {
    const user = this.authService.currentUser();
    if (user?.role === 'Viewer' && user.employee_id) {
      this.router.navigate(['/talent', user.employee_id]);
    } else {
      this.router.navigateByUrl(this.returnUrl);
    }
  }

  // ── Demo accounts ─────────────────────────────────────────────────────────
  // Các tài khoản này cần được tạo trước trong Supabase Auth Dashboard.
  // Xem supabase/seeds/demo_users.sql để biết cách seed.
  readonly demoAccounts: DemoAccount[] = [
    {
      label:    'Admin',
      email:    'admin@ptsc.vn',
      username: 'admin',
      password: 'Admin@123!',
      role:     'Admin',
      color:    'indigo',
      icon:     'crown',
      perms:    'Toàn quyền hệ thống',
    },
    {
      label:    'HR Manager',
      email:    'hr.manager@ptsc.vn',
      username: 'hr.manager',
      password: 'Hr@123!',
      role:     'HR Manager',
      color:    'blue',
      icon:     'solution',
      perms:    'Quản lý nhân tài & kế thừa',
    },
    {
      label:    'LM Kỹ thuật',
      email:    'lm.kythuat@ptsc.vn',
      username: 'lm.kythuat',
      password: 'Lm@123!',
      role:     'Line Manager',
      color:    'green',
      icon:     'team',
      perms:    'Xem & đề xuất nhân sự phòng',
    },
    {
      label:    'Viewer',
      email:    'viewer@ptsc.vn',
      username: 'viewer',
      password: 'Viewer@123!',
      role:     'Viewer',
      color:    'gray',
      icon:     'eye',
      perms:    'Xem báo cáo (read-only)',
    },
  ];

  constructor(
    private authService: AuthService,
    private router:      Router,
    private route:       ActivatedRoute,
    private msg:         NzMessageService,
  ) {}

  ngOnInit(): void {
    this.returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/dashboard';
    if (this.authService.isAuthenticated()) {
      this.navigateAfterLogin();
    }
  }

  togglePassword(): void { this.showPassword.set(!this.showPassword()); }

  // ── Email + password form submit ─────────────────────────────────────────
  async login(): Promise<void> {
    const e = this.email().trim();
    const p = this.password();
    if (!e || !p) { this.errorMsg.set('Vui lòng nhập email và mật khẩu.'); return; }
    this.loading.set(true);
    this.errorMsg.set('');
    try {
      await this.authService.loginWithEmail(e, p);
      this.navigateAfterLogin();
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'Đăng nhập thất bại. Vui lòng thử lại.');
    } finally {
      this.loading.set(false);
    }
  }

  // ── Click demo chip → điền form + tự đăng nhập ──────────────────────────
  async loginAs(account: DemoAccount): Promise<void> {
    if (this.loading()) return;

    this.email.set(account.email);
    this.password.set(account.password);
    this.activeDemo.set(account.email);
    this.loading.set(true);
    this.errorMsg.set('');

    try {
      await this.authService.loginWithEmail(account.email, account.password);
      this.navigateAfterLogin();
    } catch (err: any) {
      // Thân thiện hơn với user: gợi ý tạo tài khoản nếu chưa có
      const raw = err?.message ?? '';
      if (raw.toLowerCase().includes('invalid login') || raw.toLowerCase().includes('credentials')) {
        this.errorMsg.set(`Tài khoản demo "${account.username}" chưa được tạo trong Supabase Auth. Xem supabase/seeds/demo_users.sql.`);
      } else {
        this.errorMsg.set(raw || 'Đăng nhập thất bại.');
      }
    } finally {
      this.loading.set(false);
      this.activeDemo.set(null);
    }
  }

  async loginWithGoogle(): Promise<void> {
    try { await this.authService.loginWithGoogle(); }
    catch (err: any) { this.msg.error(err?.message ?? 'Không thể đăng nhập với Google'); }
  }
}
