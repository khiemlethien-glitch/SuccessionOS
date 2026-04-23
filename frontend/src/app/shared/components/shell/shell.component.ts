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

interface NavItem { label: string; icon: string; route: string; disabled?: boolean; requiredRole?: string; }
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
      { label: 'Kế hoạch IDP',       icon: 'solution',  route: '/idp',        disabled: true },
      { label: 'Đánh giá',           icon: 'star',      route: '/assessment',  disabled: true },
      { label: 'Kèm cặp & Cố vấn',  icon: 'user-add',  route: '/mentoring',   disabled: true },
      { label: 'Họp hiệu chỉnh',     icon: 'audit',     route: '/calibration', disabled: true },
    ]},
    { label: 'PHÂN TÍCH', items: [
      { label: 'Báo cáo',            icon: 'bar-chart', route: '/reports',     disabled: true, requiredRole: 'HR Manager' },
    ]},
    { label: 'HỆ THỐNG', items: [
      { label: 'Marketplace',        icon: 'shop',      route: '/marketplace', disabled: true },
      { label: 'Quản trị',           icon: 'setting',   route: '/admin',       requiredRole: 'Admin' },
    ]},
  ];

  toggle(): void { this.isCollapsed.set(!this.isCollapsed()); }

  canSee(item: NavItem): boolean {
    return !item.requiredRole || this.authService.hasRole(item.requiredRole);
  }

  get currentUser() {
    return this.authService.currentUser();
  }

  get userInitials(): string {
    const name = this.currentUser?.full_name || '';
    return name
      .split(' ')
      .filter(Boolean)
      .map((w: string) => w[0])
      .slice(-2)
      .join('')
      .toUpperCase() || 'U';
  }

  goToProfile(): void { this.router.navigate(['/profile']); }
  goToSettings(): void { this.router.navigate(['/settings']); }

  async logoutLocal(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }

  async logoutSSO(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }

  async logout(): Promise<void> {
    await this.logoutLocal();
  }
}
