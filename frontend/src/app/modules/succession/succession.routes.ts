import { Routes } from '@angular/router';

export const SUCCESSION_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./succession.component').then((m) => m.SuccessionComponent),
  },
];
