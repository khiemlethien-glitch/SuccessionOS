import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { ApiService } from '../services/api.service';
import { OidcService, OidcTokenResponse, VnrUserInfo } from './oidc.service';

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

  private isLoggedIn$ = new BehaviorSubject<boolean>(this.hasToken());

  constructor(
    private api: ApiService,
    private oidcService: OidcService,
  ) {}

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.api.post<LoginResponse>('auth/login', credentials).pipe(
      tap((res) => {
        const ls = this.getLocalStorage();
        ls?.setItem(this.TOKEN_KEY, res.access_token);
        ls?.setItem(this.USER_KEY, JSON.stringify(res.user));
        this.isLoggedIn$.next(true);
      })
    );
  }

  logout(redirectToSso = false): void {
    if (this.silentRefreshTimer) clearTimeout(this.silentRefreshTimer);

    const idToken = this.getLocalStorage()?.getItem(this.ID_TOKEN_KEY) ?? '';
    const ls = this.getLocalStorage();
    ls?.removeItem(this.TOKEN_KEY);
    ls?.removeItem(this.REFRESH_TOKEN_KEY);
    ls?.removeItem(this.ID_TOKEN_KEY);
    ls?.removeItem(this.TOKEN_EXPIRY_KEY);
    ls?.removeItem(this.USER_KEY);
    this.isLoggedIn$.next(false);

    if (redirectToSso && idToken && typeof window !== 'undefined') {
      window.location.href = this.oidcService.buildLogoutUrl(idToken);
    }
  }

  /**
   * Set token + user vào localStorage (reuse cho fake login & real API sau này)
   */
  setSession(token: string, user: unknown): void {
    const ls = this.getLocalStorage();
    ls?.setItem(this.TOKEN_KEY, token);
    ls?.setItem(this.USER_KEY, JSON.stringify(user));
    this.isLoggedIn$.next(true);
  }

  /**
   * Set OIDC session sau khi exchange code thành công.
   * Được gọi từ OidcCallbackComponent.
   */
  setOidcSession(tokens: OidcTokenResponse, user: VnrUserInfo): void {
    const ls = this.getLocalStorage();
    ls?.setItem(this.TOKEN_KEY,         tokens.access_token);
    ls?.setItem(this.REFRESH_TOKEN_KEY, tokens.refresh_token ?? '');
    ls?.setItem(this.ID_TOKEN_KEY,      tokens.id_token ?? '');

    const expiryMs = Date.now() + tokens.expires_in * 1000;
    ls?.setItem(this.TOKEN_EXPIRY_KEY, String(expiryMs));

    const appUser = {
      id:       user.sub,
      email:    user.email ?? '',
      fullName: user.name,
      role:     Array.isArray(user.role) ? user.role[0] : user.role,
    };
    ls?.setItem(this.USER_KEY, JSON.stringify(appUser));
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
    const refreshToken = this.getLocalStorage()?.getItem(this.REFRESH_TOKEN_KEY);
    if (!refreshToken) return;

    this.oidcService.refreshToken(refreshToken).then(tokens => {
      const ls = this.getLocalStorage();
      ls?.setItem(this.TOKEN_KEY,         tokens.access_token);
      ls?.setItem(this.REFRESH_TOKEN_KEY, tokens.refresh_token ?? refreshToken);
      const expiryMs = Date.now() + tokens.expires_in * 1000;
      ls?.setItem(this.TOKEN_EXPIRY_KEY, String(expiryMs));
      this.scheduleSilentRefresh(tokens.expires_in);
    }).catch(() => {
      this.logout();
    });
  }

  getToken(): string | null {
    return this.getLocalStorage()?.getItem(this.TOKEN_KEY) ?? null;
  }

  getCurrentUser() {
    const raw = this.getLocalStorage()?.getItem(this.USER_KEY);
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

  private getLocalStorage(): Storage | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  }

  private hasToken(): boolean {
    return !!this.getLocalStorage()?.getItem(this.TOKEN_KEY);
  }
}
