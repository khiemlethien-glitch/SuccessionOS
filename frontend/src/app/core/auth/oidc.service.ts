import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
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

    this.saveOidcState(state, verifier);

    const params = new URLSearchParams({
      response_type:         'code',
      client_id:             this.cfg.clientId,
      redirect_uri:          this.cfg.redirectUri,
      scope:                 this.cfg.scope,
      state,
      code_challenge:        challenge,
      code_challenge_method: 'S256',
    });

    return `${this.cfg.issuer}/connect/authorize?${params.toString()}`;
  }

  // ─── Basic Auth header for /connect/token ────────────────────
  //
  // VnR yêu cầu credentials ở header (Basic Auth), KHÔNG để trong body.
  // Theo RFC 6749 §2.3.1, clientId + clientSecret phải được URL-encode
  // (form-urlencoded) TRƯỚC khi base64, vì ký tự đặc biệt như `:`, `+`,
  // `/`, `=` hoặc unicode sẽ phá vỡ Basic Auth parsing phía server.

  private tokenEndpointHeaders(): HttpHeaders {
    const user = encodeURIComponent(this.cfg.clientId);
    const pass = encodeURIComponent(this.cfg.clientSecret);
    // Unicode-safe base64: chuyển sang UTF-8 bytes trước khi btoa.
    const bytes = new TextEncoder().encode(`${user}:${pass}`);
    let binary = '';
    bytes.forEach(b => (binary += String.fromCharCode(b)));
    const credentials = btoa(binary);

    return new HttpHeaders({
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    });
  }

  // ─── Exchange code → tokens ───────────────────────────────────

  exchangeCode(code: string, verifier: string): Promise<OidcTokenResponse> {
    const body = new HttpParams()
      .set('grant_type',    'authorization_code')
      .set('code',          code)
      .set('redirect_uri',  this.cfg.redirectUri)
      .set('code_verifier', verifier);

    return this.http
      .post<OidcTokenResponse>(
        `${this.cfg.issuer}/connect/token`,
        body.toString(),
        { headers: this.tokenEndpointHeaders() },
      )
      .toPromise() as Promise<OidcTokenResponse>;
  }

  // ─── Refresh token ────────────────────────────────────────────

  refreshToken(refreshToken: string): Promise<OidcTokenResponse> {
    const body = new HttpParams()
      .set('grant_type',    'refresh_token')
      .set('refresh_token', refreshToken);

    return this.http
      .post<OidcTokenResponse>(
        `${this.cfg.issuer}/connect/token`,
        body.toString(),
        { headers: this.tokenEndpointHeaders() },
      )
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
