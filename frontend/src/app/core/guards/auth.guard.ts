import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
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
 *
 * SSR fix: trên server (prerendering) không có localStorage → Supabase session
 * luôn null → guard redirect /login → HTML prerender chứa redirect sai.
 * Khi browser load trang, prerendered redirect kích hoạt dù user đã login.
 * Fix: return true ngay trên server, để client-side tự xử lý auth sau hydration.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  // Server-side (SSR/prerendering): không có localStorage, không thể check session.
  // Trả về true để server render đúng nội dung, client sẽ check auth sau hydration.
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;

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
