import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: 'talent/:id',    renderMode: RenderMode.Server },
  // OIDC callback must run purely on the client — it reads PKCE state
  // from sessionStorage that /login sets before redirecting to VnR. A
  // prerendered or SSR snapshot has no access to that storage, so the
  // hydrated page would call popOidcState() → null → "State không hợp
  // lệ (CSRF protection)" every time.
  { path: 'auth/callback', renderMode: RenderMode.Client },
  { path: '**',            renderMode: RenderMode.Prerender },
];
