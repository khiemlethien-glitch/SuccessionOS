import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { AuthService } from '../../../core/auth/auth.service';
import { OidcService } from '../../../core/auth/oidc.service';

type DemoUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  talentId?: string;
};

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NzInputModule,
    NzIconModule,
    NzButtonModule,
    NzDividerModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  username = signal('');
  password = signal('');
  showPassword = signal(false);
  errorMsg = signal('');

  // Mock credentials — khi backend sẵn sàng, đổi sang authService.login() gọi /auth/login
  private readonly mockCredentials: Array<{ username: string; password: string; user: DemoUser }> = [
    { username: 'admin',      password: 'admin123',  user: { id: 'U001', name: 'HR Admin',         email: 'admin@ptscmc.vn',   role: 'Admin' } },
    { username: 'hr.manager', password: 'hr123',     user: { id: 'U002', name: 'Nguyễn Thị Hoa',   email: 'hoa.nt@ptscmc.vn',  role: 'HR Manager' } },
    { username: 'lm.kythuat', password: 'lm123',     user: { id: 'U003', name: 'Trần Minh Tuấn',   email: 'tuan.tm@ptscmc.vn', role: 'Line Manager', department: 'Kỹ thuật',      talentId: 'T020' } },
    { username: 'viewer',     password: 'viewer123', user: { id: 'U005', name: 'Phạm Quốc Việt',   email: 'viet.pq@ptscmc.vn', role: 'Viewer' } },
  ];

  private readonly heroCandidates = [
    'https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=1600&q=80',
    'https://images.unsplash.com/photo-1532601224476-15c79f2f7a51?w=1600&q=80',
    'https://source.unsplash.com/1600x1200/?offshore,wind,turbine,ocean',
  ] as const;

  heroIdx = signal(0);
  get heroUrl(): string {
    return this.heroCandidates[this.heroIdx()] ?? this.heroCandidates[0];
  }

  constructor(
    private authService: AuthService,
    private oidcService: OidcService,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (this.authService.isLoggedIn) {
      this.router.navigate(['/dashboard']);
    }
  }

  nextHero(): void {
    const next = Math.min(this.heroCandidates.length - 1, this.heroIdx() + 1);
    this.heroIdx.set(next);
  }

  togglePassword(): void {
    this.showPassword.set(!this.showPassword());
  }

  loginFake(): void {
    const u = this.username().trim();
    const p = this.password();
    if (!u || !p) {
      this.errorMsg.set('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }
    const match = this.mockCredentials.find(c => c.username === u && c.password === p);
    if (!match) {
      this.errorMsg.set('Tên đăng nhập hoặc mật khẩu không đúng.');
      return;
    }
    this.errorMsg.set('');
    const token = `fake-jwt-${Date.now()}`;
    this.authService.setSession(token, match.user);
    this.router.navigate(['/dashboard']);
  }

  fillDemo(username: string, password: string): void {
    this.username.set(username);
    this.password.set(password);
    this.errorMsg.set('');
  }

  async loginWithVnR(): Promise<void> {
    try {
      const url = await this.oidcService.buildAuthorizeUrl();
      if (typeof window !== 'undefined') {
        window.location.href = url;
      }
    } catch (err) {
      this.errorMsg.set('Không thể kết nối HRM Pro. Vui lòng thử lại.');
    }
  }
}

