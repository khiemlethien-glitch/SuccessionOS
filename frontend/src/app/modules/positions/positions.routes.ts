import { Routes } from '@angular/router';
export const POSITIONS_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./positions.component').then(m => m.PositionsComponent) }
];
