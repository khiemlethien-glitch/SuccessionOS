import { Component, inject, signal, HostListener, OnInit, OnDestroy, PLATFORM_ID } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { filter, Subscription } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';

interface NavItem {
  label: string; icon: string; route: string;
  disabled?: boolean;
  requiredRole?: string;   // minimum role để thấy item
  viewerOnly?:  boolean;   // chỉ hiện với Viewer, ẩn với roles cao hơn
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive,
    NzLayoutModule, NzMenuModule, NzIconModule, NzAvatarModule,
    NzTooltipModule, NzDropDownModule, NzButtonModule],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit, OnDestroy {
  isCollapsed = signal(false);
  isMobile    = signal(false);
  mobileOpen  = signal(false);

  private router      = inject(Router);
  private authService = inject(AuthService);
  private platformId  = inject(PLATFORM_ID);
  private routerSub?: Subscription;

  navGroups: NavGroup[] = [
    { label: 'QUẢN LÝ NHÂN TÀI', items: [
      { label: 'Dashboard',          icon: 'dashboard',  route: '/dashboard',   requiredRole: 'Line Manager' },
      { label: 'Hồ sơ của tôi',      icon: 'user',       route: '/me',          viewerOnly: true },
      { label: 'Nhân tài',           icon: 'team',       route: '/talent',      requiredRole: 'Line Manager' },
      { label: 'Vị trí then chốt',   icon: 'apartment',  route: '/positions',   requiredRole: 'Line Manager' },
      { label: 'Bản đồ kế thừa',     icon: 'cluster',    route: '/succession',  requiredRole: 'Line Manager' },
    ]},
    { label: 'PHÁT TRIỂN', items: [
      { label: 'Kế hoạch IDP',       icon: 'solution',   route: '/idp',         disabled: true },
      { label: 'Đánh giá',           icon: 'star',       route: '/assessment',  disabled: true },
      { label: 'Kèm cặp & Cố vấn',  icon: 'user-add',   route: '/mentoring' },
      { label: 'Họp hiệu chỉnh',     icon: 'audit',      route: '/calibration', disabled: true, requiredRole: 'Line Manager' },
    ]},
    { label: 'PHÂN TÍCH', items: [
      { label: 'Báo cáo',            icon: 'bar-chart',  route: '/reports',     disabled: true, requiredRole: 'Line Manager' },
    ]},
    { label: 'HỆ THỐNG', items: [
      { label: 'Marketplace',        icon: 'shop',       route: '/marketplace', disabled: true, requiredRole: 'HR Manager' },
      { label: 'Quản trị',           icon: 'setting',    route: '/admin',       requiredRole: 'Line Manager' },
    ]},
  ];

  constructor() {
    // Guard: window không tồn tại trong SSR (Node.js)
    if (isPlatformBrowser(this.platformId)) this.checkMobile();
  }

  ngOnInit(): void {
    // Auto-close mobile drawer on navigation
    this.routerSub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.mobileOpen.set(false));
  }

  ngOnDestroy(): void { this.routerSub?.unsubscribe(); }

  @HostListener('window:resize')
  checkMobile(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const mobile = window.innerWidth <= 768;
    this.isMobile.set(mobile);
    if (!mobile) this.mobileOpen.set(false);
  }

  openMobileMenu():  void { this.mobileOpen.set(true); }
  closeMobileMenu(): void { this.mobileOpen.set(false); }
  toggle():          void { this.isCollapsed.set(!this.isCollapsed()); }

  canSee(item: NavItem): boolean {
    if (item.viewerOnly) return this.authService.isViewer();
    if (item.requiredRole && !this.authService.hasRole(item.requiredRole)) return false;
    return true;
  }

  get currentUser() { return this.authService.currentUser(); }

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

  goToProfile(): void  { this.router.navigate(['/profile']); }
  goToSettings(): void { this.router.navigate(['/settings']); }

  async logoutLocal(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }

  async logoutSSO(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}
