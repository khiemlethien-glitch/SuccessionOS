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

  api: {
    // Relative path → Vercel proxies /postgrest/* → http://103.72.97.160:3000/*
    // Avoids Mixed Content (HTTPS page → HTTP backend)
    url: '/postgrest',
  },

  supabase: {
    url:     'https://psaidbntrvrzodurnisz.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzYWlkYm50cnZyem9kdXJuaXN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NDExNjQsImV4cCI6MjA5MjQxNzE2NH0.Gqb216Qvw3h3KmckA9VqMnyNXDmtriW67uU1t0TfQfo',
  },

  openaiKey: '',
};
