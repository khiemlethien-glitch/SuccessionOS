import { inject } from '@angular/core';
import { CanActivateFn, Router, RouterStateSnapshot, ActivatedRouteSnapshot } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { AuthService } from '../auth/auth.service';

export const authGuard: CanActivateFn = (_route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const platformId = inject(PLATFORM_ID);
  // During SSR prerender, allow pass-through
  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticatedSnapshot()) {
    return true;
  }

  // Lưu URL đang cố truy cập để sau SSO callback redirect về đúng chỗ
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('oidc_redirect', state.url);
  }

  return router.createUrlTree(['/login']);
};
