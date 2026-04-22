/**
 * Template for production — copy to environment.prod.ts and fill real values.
 * Gitignored. See environment.example.ts for details.
 *
 * Trên Vercel: đặt env var `SUPABASE_ANON_KEY` → prebuild script sẽ inject.
 */
export const environment = {
  production: true,
  useMock:    false,
  appUrl:     'https://succession-os-y6mt.vercel.app',

  supabase: {
    url:     'https://psaidbntrvrzodurnisz.supabase.co',
    anonKey: 'REPLACE_WITH_SUPABASE_ANON_KEY',
  },
};
