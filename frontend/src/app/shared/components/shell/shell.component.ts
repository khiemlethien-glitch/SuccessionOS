import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

interface NavItem { label: string; icon: string; route: string; }
interface NavGroup { label: string; items: NavItem[]; }

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive,
    NzLayoutModule, NzMenuModule, NzIconModule, NzAvatarModule, NzTooltipModule, NzDropDownModule],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  isCollapsed = signal(false);

  private router = inject(Router);
  private authService = inject(AuthService);

  navGroups: NavGroup[] = [
    { label: 'QUẢN LÝ NHÂN TÀI', items: [
      { label: 'Dashboard',          icon: 'dashboard', route: '/dashboard' },
      { label: 'Nhân tài',           icon: 'team',      route: '/talent' },
      { label: 'Vị trí then chốt',   icon: 'apartment', route: '/positions' },
      { label: 'Bản đồ kế thừa',     icon: 'cluster',   route: '/succession' },
    ]},
    { label: 'PHÁT TRIỂN', items: [
      { label: 'Kế hoạch IDP',       icon: 'solution',  route: '/idp' },
      { label: 'Đánh giá',           icon: 'star',      route: '/assessment' },
      { label: 'Kèm cặp & Cố vấn',  icon: 'user-add',  route: '/mentoring' },
      { label: 'Họp hiệu chỉnh',     icon: 'audit',     route: '/calibration' },
    ]},
    { label: 'PHÂN TÍCH', items: [
      { label: 'Báo cáo',            icon: 'bar-chart', route: '/reports' },
    ]},
    { label: 'HỆ THỐNG', items: [
      { label: 'Marketplace',        icon: 'shop',      route: '/marketplace' },
      { label: 'Quản trị',           icon: 'setting',   route: '/admin' },
    ]},
  ];

  toggle(): void { this.isCollapsed.set(!this.isCollapsed()); }

  get currentUser(): { name?: string; fullName?: string; role?: string } | null {
    return this.authService.getCurrentUser?.() ?? null;
  }

  get userInitials(): string {
    const name = this.currentUser?.fullName || this.currentUser?.name || 'U';
    return name
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0])
      .slice(-2)
      .join('')
      .toUpperCase();
  }

  goToProfile(): void {
    this.router.navigate(['/profile']);
  }

  goToSettings(): void {
    this.router.navigate(['/settings']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
