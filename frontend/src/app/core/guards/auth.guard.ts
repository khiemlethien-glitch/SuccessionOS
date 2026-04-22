import { CanActivateFn } from '@angular/router';

// TODO BYPASS: Tạm thời allow tất cả routes (chờ Supabase anonKey + RLS policies).
// Khi bật auth thật: khôi phục logic kiểm tra session (inject AuthService,
// check isAuthenticatedSnapshot(), redirect /login nếu không có).
export const authGuard: CanActivateFn = () => true;
