import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { ApiService } from '../services/api.service';
import { OidcService, OidcTokenResponse, VnrUserInfo } from './oidc.service';
import {
  safeLocalStorage,
  safeNavigateTo,
} from '../utils/browser.utils';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  };
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly TOKEN_KEY         = 'access_token';
  private readonly USER_KEY          = 'current_user';
  private readonly REFRESH_TOKEN_KEY = 'refresh_token';
  private readonly ID_TOKEN_KEY      = 'id_token';
  private readonly TOKEN_EXPIRY_KEY  = 'token_expiry';
  private silentRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  // SSR-safe: khởi tạo với false (server không có token),
  // giá trị thực được set trong constructor sau khi kiểm tra môi trường.
  private isLoggedIn$ = new BehaviorSubject<boolean>(false);

  constructor(
    private api: ApiService,
    private oidcService: OidcService,
  ) {
    // Đọc token sau khi Angular DI hoàn tất — an toàn cả SSR lẫn browser.
    this.isLoggedIn$.next(this.hasToken());
  }

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.api.post<LoginResponse>('auth/login', credentials).pipe(
      tap((res) => {
        safeLocalStorage.setItem(this.TOKEN_KEY, res.access_token);
        safeLocalStorage.setItem(this.USER_KEY, JSON.stringify(res.user));
        this.isLoggedIn$.next(true);
      })
    );
  }

  logout(redirectToSso = false): void {
    if (this.silentRefreshTimer) clearTimeout(this.silentRefreshTimer);

    const idToken = safeLocalStorage.getItem(this.ID_TOKEN_KEY) ?? '';
    safeLocalStorage.removeItem(this.TOKEN_KEY);
    safeLocalStorage.removeItem(this.REFRESH_TOKEN_KEY);
    safeLocalStorage.removeItem(this.ID_TOKEN_KEY);
    safeLocalStorage.removeItem(this.TOKEN_EXPIRY_KEY);
    safeLocalStorage.removeItem(this.USER_KEY);
    this.isLoggedIn$.next(false);

    if (redirectToSso && idToken) {
      safeNavigateTo(this.oidcService.buildLogoutUrl(idToken));
    }
  }

  /**
   * Set token + user vào localStorage (reuse cho fake login & real API sau này)
   */
  setSession(token: string, user: unknown): void {
    safeLocalStorage.setItem(this.TOKEN_KEY, token);
    safeLocalStorage.setItem(this.USER_KEY, JSON.stringify(user));
    this.isLoggedIn$.next(true);
  }

  /**
   * Set OIDC session sau khi exchange code thành công.
   * Được gọi từ OidcCallbackComponent.
   */
  setOidcSession(tokens: OidcTokenResponse, user: VnrUserInfo): void {
    safeLocalStorage.setItem(this.TOKEN_KEY,         tokens.access_token);
    safeLocalStorage.setItem(this.REFRESH_TOKEN_KEY, tokens.refresh_token ?? '');
    safeLocalStorage.setItem(this.ID_TOKEN_KEY,      tokens.id_token ?? '');

    const expiryMs = Date.now() + tokens.expires_in * 1000;
    safeLocalStorage.setItem(this.TOKEN_EXPIRY_KEY, String(expiryMs));

    const appUser = {
      id:       user.sub,
      email:    user.email ?? '',
      fullName: user.name,
      role:     Array.isArray(user.role) ? user.role[0] : user.role,
    };
    safeLocalStorage.setItem(this.USER_KEY, JSON.stringify(appUser));
    this.isLoggedIn$.next(true);

    this.scheduleSilentRefresh(tokens.expires_in);
  }

  private scheduleSilentRefresh(expiresIn: number): void {
    if (typeof window === 'undefined') return;
    if (this.silentRefreshTimer) clearTimeout(this.silentRefreshTimer);

    const delayMs = Math.max((expiresIn - 60) * 1000, 0);
    this.silentRefreshTimer = setTimeout(() => this.doSilentRefresh(), delayMs);
  }

  private doSilentRefresh(): void {
    const refreshToken = safeLocalStorage.getItem(this.REFRESH_TOKEN_KEY);
    if (!refreshToken) return;

    this.oidcService.refreshToken(refreshToken).then(tokens => {
      safeLocalStorage.setItem(this.TOKEN_KEY,         tokens.access_token);
      safeLocalStorage.setItem(this.REFRESH_TOKEN_KEY, tokens.refresh_token ?? refreshToken);
      const expiryMs = Date.now() + tokens.expires_in * 1000;
      safeLocalStorage.setItem(this.TOKEN_EXPIRY_KEY, String(expiryMs));
      this.scheduleSilentRefresh(tokens.expires_in);
    }).catch(() => {
      this.logout();
    });
  }

  getToken(): string | null {
    return safeLocalStorage.getItem(this.TOKEN_KEY);
  }

  getCurrentUser() {
    const raw = safeLocalStorage.getItem(this.USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  isAuthenticated(): Observable<boolean> {
    return this.isLoggedIn$.asObservable();
  }

  get isLoggedIn(): boolean {
    return this.isAuthenticatedSnapshot();
  }

  isAuthenticatedSnapshot(): boolean {
    return this.hasToken();
  }

  private hasToken(): boolean {
    return !!safeLocalStorage.getItem(this.TOKEN_KEY);
  }
}
