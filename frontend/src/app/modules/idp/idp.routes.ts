import { Routes } from '@angular/router';

export const IDP_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./idp.component').then((m) => m.IdpComponent),
  },
];
