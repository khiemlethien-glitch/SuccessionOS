/**
 * Template — copy to environment.prod.ts and fill in real values.
 * Gitignored. See environment.example.ts for details.
 */
export const environment = {
  production: true,
  apiUrl:     'https://api.successionos.vn/api/v1',
  stagingUrl: 'https://api.successionos.vn/api/v1',
  // Backend .NET 8 chưa deploy (theo CLAUDE.md). Bật useMock để Vercel
  // serve public/mock/*.json thay vì gọi api.successionos.vn (chưa có
  // DNS record → ERR_NAME_NOT_RESOLVED). Tắt khi backend live.
  useMock:    true,

  appUrl: 'https://succession-os-y6mt.vercel.app',

  oidc: {
    issuer:                'https://ba.vnresource.net:1516',
    clientId:              'hrm_scc_prod',
    clientSecret:          'REPLACE_WITH_REAL_SECRET',
    scope:                 'openid profile api',
    redirectUri:           'https://succession-os-y6mt.vercel.app/auth/callback',
    postLogoutRedirectUri: 'https://succession-os-y6mt.vercel.app/login',
    frontChannelLogoutUri: 'https://succession-os-y6mt.vercel.app/auth/logout',
    silentRefreshUri:      'https://succession-os-y6mt.vercel.app/silent-refresh.html',
  },
};
