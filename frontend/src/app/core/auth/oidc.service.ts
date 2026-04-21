import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface OidcTokenResponse {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export interface VnrUserInfo {
  sub: string;
  name: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  role: string | string[];
}

@Injectable({ providedIn: 'root' })
export class OidcService {
  private readonly cfg = environment.oidc;

  constructor(private http: HttpClient) {}

  // ─── PKCE helpers ───────────────────────────────────────────

  generateCodeVerifier(): string {
    const array = new Uint8Array(48);
    crypto.getRandomValues(array);
    return this.base64UrlEncode(array);
  }

  async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return this.base64UrlEncode(new Uint8Array(digest));
  }

  generateState(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return this.base64UrlEncode(array);
  }

  private base64UrlEncode(buffer: Uint8Array): string {
    return btoa(String.fromCharCode(...buffer))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // ─── PKCE session storage ────────────────────────────────────

  saveOidcState(state: string, verifier: string): void {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem('oidc_state', state);
    sessionStorage.setItem('oidc_verifier', verifier);
  }

  popOidcState(): { state: string; verifier: string } | null {
    if (typeof window === 'undefined') return null;
    const state    = sessionStorage.getItem('oidc_state');
    const verifier = sessionStorage.getItem('oidc_verifier');
    sessionStorage.removeItem('oidc_state');
    sessionStorage.removeItem('oidc_verifier');
    if (!state || !verifier) return null;
    return { state, verifier };
  }

  // ─── Build Authorization URL ─────────────────────────────────

  async buildAuthorizeUrl(): Promise<string> {
    const verifier  = this.generateCodeVerifier();
    const challenge = await this.generateCodeChallenge(verifier);
    const state     = this.generateState();
    const nonce     = this.generateState();  // Same generator — 16-byte random

    this.saveOidcState(state, verifier);

    const params = new URLSearchParams({
      response_type:         'code',
      client_id:             this.cfg.clientId,
      redirect_uri:          this.cfg.redirectUri,
      scope:                 this.cfg.scope,
      state,
      // VnR docs §2.2 list `nonce` as required even for code flow. OIDC spec
      // only mandates it when id_token is in the response_type, but VnR's
      // IdentityServer config appears to enforce it regardless.
      nonce,
      code_challenge:        challenge,
      code_challenge_method: 'S256',
    });

    return `${this.cfg.issuer}/connect/authorize?${params.toString()}`;
  }

  // ─── Exchange code → tokens ───────────────────────────────────
  //
  // Theo tài liệu VnR Identity §3.2.1 (Authorization Code flow):
  //   - Header: CHỈ Content-Type: application/x-www-form-urlencoded
  //   - Body  : client_id, client_secret, grant_type, code, redirect_uri
  //             (+ code_verifier khi PKCE enabled)
  // KHÔNG dùng Authorization: Basic header — đó là quy ước riêng cho
  // grant "password" (§3.2.2), không áp dụng cho authorization_code.

  exchangeCode(code: string, verifier: string): Promise<OidcTokenResponse> {
    // IMPORTANT: dùng URLSearchParams, KHÔNG dùng HttpParams của Angular.
    // HttpParams default encoder để `+` unencoded (coi là query char hợp lệ),
    // nhưng trong application/x-www-form-urlencoded, `+` = space. Nếu
    // clientSecret chứa `+` (như base64 secret của VnR), server sẽ decode
    // sai → invalid_client.
    const body = new URLSearchParams();
    body.set('grant_type',    'authorization_code');
    body.set('client_id',     this.cfg.clientId);
    body.set('client_secret', this.cfg.clientSecret);
    body.set('code',          code);
    body.set('redirect_uri',  this.cfg.redirectUri);
    body.set('code_verifier', verifier);

    const headers = new HttpHeaders({
      'Content-Type': 'application/x-www-form-urlencoded',
    });

    return this.http
      .post<OidcTokenResponse>(`${this.cfg.issuer}/connect/token`, body.toString(), { headers })
      .toPromise() as Promise<OidcTokenResponse>;
  }

  // ─── Refresh token ────────────────────────────────────────────

  refreshToken(refreshToken: string): Promise<OidcTokenResponse> {
    const body = new URLSearchParams();
    body.set('grant_type',    'refresh_token');
    body.set('client_id',     this.cfg.clientId);
    body.set('client_secret', this.cfg.clientSecret);
    body.set('refresh_token', refreshToken);

    const headers = new HttpHeaders({
      'Content-Type': 'application/x-www-form-urlencoded',
    });

    return this.http
      .post<OidcTokenResponse>(`${this.cfg.issuer}/connect/token`, body.toString(), { headers })
      .toPromise() as Promise<OidcTokenResponse>;
  }

  // ─── UserInfo ─────────────────────────────────────────────────

  getUserInfo(accessToken: string): Promise<VnrUserInfo> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    return this.http
      .get<VnrUserInfo>(`${this.cfg.issuer}/connect/userinfo`, { headers })
      .toPromise() as Promise<VnrUserInfo>;
  }

  // ─── Logout URL ───────────────────────────────────────────────

  buildLogoutUrl(idToken: string): string {
    const params = new URLSearchParams({
      id_token_hint:            idToken,
      post_logout_redirect_uri: this.cfg.postLogoutRedirectUri,
    });
    return `${this.cfg.issuer}/connect/endsession?${params.toString()}`;
  }
}
