import { Routes } from '@angular/router';
export const MARKETPLACE_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./marketplace.component').then(m => m.MarketplaceComponent) }
];
