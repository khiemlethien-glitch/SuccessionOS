import { Routes } from '@angular/router';

export const ASSESSMENT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./assessment.component').then((m) => m.AssessmentComponent),
  },
];
