import { Routes } from '@angular/router';
export const MENTORING_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./mentoring.component').then(m => m.MentoringComponent) }
];
