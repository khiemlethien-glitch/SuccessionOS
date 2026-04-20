import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { AuthService } from '../../../core/auth/auth.service';

type DemoUser = { id: string; name: string; email: string; role: string };

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
    // IMPORTANT: bỏ qua form hoàn toàn (no validate / no check input)
    const fakeToken = `fake-jwt-${Date.now()}`;
    const fakeUser: DemoUser = { id: 'U001', name: 'Hoàng Anh', email: 'demo@ptscmc.vn', role: 'admin' };
    this.authService.setSession(fakeToken, fakeUser);
    this.router.navigate(['/dashboard']);
  }
}

