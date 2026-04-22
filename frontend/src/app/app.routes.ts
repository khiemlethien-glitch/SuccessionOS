import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'login', loadChildren: () => import('./modules/auth/login.routes').then(m => m.LOGIN_ROUTES) },
  { path: 'auth/callback', redirectTo: '/dashboard' },
  { path: 'logout',        redirectTo: '/login' },
  { path: 'silent-refresh', redirectTo: '/' },
  {
    path: '',
    loadComponent: () => import('./shared/components/shell/shell.component').then(m => m.ShellComponent),
    canActivateChild: [authGuard],
    children: [
      { path: 'dashboard',   loadChildren: () => import('./modules/dashboard/dashboard.routes').then(m => m.DASHBOARD_ROUTES) },
      { path: 'talent',      loadChildren: () => import('./modules/talent/talent.routes').then(m => m.TALENT_ROUTES) },
      { path: 'positions',   loadChildren: () => import('./modules/positions/positions.routes').then(m => m.POSITIONS_ROUTES) },
      { path: 'succession',  loadChildren: () => import('./modules/succession/succession.routes').then(m => m.SUCCESSION_ROUTES) },
      { path: 'idp',         loadChildren: () => import('./modules/idp/idp.routes').then(m => m.IDP_ROUTES) },
      { path: 'assessment',  loadChildren: () => import('./modules/assessment/assessment.routes').then(m => m.ASSESSMENT_ROUTES) },
      { path: 'mentoring',   loadChildren: () => import('./modules/mentoring/mentoring.routes').then(m => m.MENTORING_ROUTES) },
      { path: 'calibration', loadChildren: () => import('./modules/calibration/calibration.routes').then(m => m.CALIBRATION_ROUTES) },
      { path: 'reports',     loadChildren: () => import('./modules/reports/reports.routes').then(m => m.REPORTS_ROUTES) },
      { path: 'marketplace', loadChildren: () => import('./modules/marketplace/marketplace.routes').then(m => m.MARKETPLACE_ROUTES) },
      { path: 'admin',       loadChildren: () => import('./modules/admin/admin.routes').then(m => m.ADMIN_ROUTES) },
      { path: 'profile',     loadComponent: () => import('./modules/profile/profile.component').then(m => m.ProfileComponent) },
      { path: 'settings',    loadComponent: () => import('./modules/settings/settings.component').then(m => m.SettingsComponent) },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
