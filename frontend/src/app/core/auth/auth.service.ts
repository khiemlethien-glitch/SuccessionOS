import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { ApiService } from '../services/api.service';

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
  private readonly TOKEN_KEY = 'access_token';
  private readonly USER_KEY = 'current_user';

  private isLoggedIn$ = new BehaviorSubject<boolean>(this.hasToken());

  constructor(private api: ApiService) {}

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

  logout(): void {
    const ls = this.getLocalStorage();
    ls?.removeItem(this.TOKEN_KEY);
    ls?.removeItem(this.USER_KEY);
    this.isLoggedIn$.next(false);
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
    // SSR-safe: `localStorage` does not exist on the server runtime.
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  }

  private hasToken(): boolean {
    return !!this.getLocalStorage()?.getItem(this.TOKEN_KEY);
  }
}
