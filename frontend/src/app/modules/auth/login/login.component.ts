import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    NzInputModule, NzIconModule, NzButtonModule, NzDividerModule, NzSpinModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  email    = signal('');
  password = signal('');
  showPassword = signal(false);
  errorMsg = signal('');
  loading  = signal(false);

  private readonly heroCandidates = [
    'https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=1600&q=80',
    'https://images.unsplash.com/photo-1532601224476-15c79f2f7a51?w=1600&q=80',
  ] as const;

  heroIdx = signal(0);
  get heroUrl(): string { return this.heroCandidates[this.heroIdx()] ?? this.heroCandidates[0]; }

  constructor(
    private authService: AuthService,
    private router: Router,
    private msg: NzMessageService,
  ) {}

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
    }
  }

  togglePassword(): void { this.showPassword.set(!this.showPassword()); }

  async login(): Promise<void> {
    const e = this.email().trim();
    const p = this.password();
    if (!e || !p) { this.errorMsg.set('Vui lòng nhập email và mật khẩu.'); return; }
    this.loading.set(true);
    this.errorMsg.set('');
    try {
      await this.authService.loginWithEmail(e, p);
      this.router.navigate(['/dashboard']);
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'Đăng nhập thất bại. Vui lòng thử lại.');
    } finally {
      this.loading.set(false);
    }
  }

  async loginWithGoogle(): Promise<void> {
    try { await this.authService.loginWithGoogle(); }
    catch (err: any) { this.msg.error(err?.message ?? 'Không thể đăng nhập với Google'); }
  }

  fillDemo(email: string, password: string): void {
    this.email.set(email);
    this.password.set(password);
    this.errorMsg.set('');
  }
}
