import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';

/**
 * Auth guard — waits for Supabase session to restore before checking auth.
 *
 * Bug cũ: guard chạy ngay khi reload → session chưa restore (getSession async)
 * → isAuthenticated = false → redirect /login dù đã đăng nhập.
 *
 * Fix: dùng toObservable(isLoading) để đợi isLoading = false trước,
 * rồi mới kiểm tra session. isLoading chỉ set false sau khi getSession()
 * và loadProfile() đã hoàn tất.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  return toObservable(auth.isLoading).pipe(
    filter(loading => !loading),   // đợi auth init xong
    take(1),
    map(() => {
      if (auth.isAuthenticated()) return true;
      return router.createUrlTree(['/login'], {
        queryParams: { returnUrl: state.url },
      });
    }),
  );
};
