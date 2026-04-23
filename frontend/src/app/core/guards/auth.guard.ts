import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

/**
 * Auth guard — redirects unauthenticated users to /login.
 *
 * NOTE for local dev: create a test user in Supabase Auth Dashboard
 * (Authentication → Users → Invite user) then log in via /login.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticatedSnapshot()) return true;

  // Preserve the intended URL so the login page can redirect back after login
  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};
