/**
 * Template — copy to environment.ts and fill in real values locally.
 * The real environment.ts is gitignored (contains OIDC clientSecret).
 *
 * On CI (Vercel), `npm run prebuild` copies this file to environment.ts
 * if one isn't present so the build succeeds with placeholder secrets.
 * SSO won't work against VnR in that case — mock login still does.
 */
export const environment = {
  production: false,
  apiUrl:     'http://localhost:5000/api/v1',
  stagingUrl: 'https://api.successionos.vn/api/v1',
  useMock:    true,

  appUrl: 'http://localhost:4200',

  oidc: {
    issuer:                'https://ba.vnresource.net:1516',
    clientId:              'hrm_scc_dev',
    clientSecret:          'REPLACE_WITH_REAL_SECRET',
    scope:                 'openid profile api',
    redirectUri:           'http://localhost:4200/auth/callback',
    postLogoutRedirectUri: 'http://localhost:4200/login',
    frontChannelLogoutUri: 'http://localhost:4200/logout',
    silentRefreshUri:      'http://localhost:4200/silent-refresh.html',
  },
};
