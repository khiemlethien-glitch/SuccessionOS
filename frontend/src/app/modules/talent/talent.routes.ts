import { Routes } from '@angular/router';
export const TALENT_ROUTES: Routes = [
  { path: '',    loadComponent: () => import('./talent-list.component').then(m => m.TalentListComponent) },
  { path: ':id', loadComponent: () => import('./talent-profile.component').then(m => m.TalentProfileComponent) },
];
