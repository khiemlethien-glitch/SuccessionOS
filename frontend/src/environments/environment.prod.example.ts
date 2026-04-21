/**
 * Template — copy to environment.prod.ts and fill in real values.
 * Gitignored. See environment.example.ts for details.
 */
export const environment = {
  production: true,
  apiUrl:     'https://api.successionos.vn/api/v1',
  stagingUrl: 'https://api.successionos.vn/api/v1',
  useMock:    false,

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
