import { HttpInterceptorFn } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment';
import { safeLocalStorage } from '../utils/browser.utils';

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const platformId = inject(PLATFORM_ID);
  if (!isPlatformBrowser(platformId)) {
    return next(req);
  }

  // Không attach token vào OIDC endpoints (connect/token, connect/userinfo, connect/endsession)
  // — VnR Identity Server sẽ reject request có Authorization header lạ
  const isOidcEndpoint = req.url.startsWith(environment.oidc.issuer);
  if (isOidcEndpoint) {
    return next(req);
  }

  const token = safeLocalStorage.getItem('access_token');
  if (token) {
    const cloned = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${token}`),
    });
    return next(cloned);
  }

  return next(req);
};
