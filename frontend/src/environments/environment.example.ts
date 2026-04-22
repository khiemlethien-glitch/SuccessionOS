/**
 * Template — copy to environment.ts and fill in real values locally.
 * The real environment.ts is gitignored (may contain service_role key).
 *
 * On CI (Vercel), `npm run prebuild` copies this file to environment.ts
 * if one isn't present so the build succeeds with placeholder values.
 */
export const environment = {
  production: false,
  useMock:    false,
  appUrl:     'http://localhost:4200',

  supabase: {
    url:     'https://psaidbntrvrzodurnisz.supabase.co',
    anonKey: 'REPLACE_WITH_SUPABASE_ANON_KEY',
  },
};
