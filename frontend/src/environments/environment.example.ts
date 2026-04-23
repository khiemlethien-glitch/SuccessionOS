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
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzYWlkYm50cnZyem9kdXJuaXN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NDExNjQsImV4cCI6MjA5MjQxNzE2NH0.Gqb216Qvw3h3KmckA9VqMnyNXDmtriW67uU1t0TfQfo',
  },

  // Placeholder — replace with real key locally; use Edge Function in production
  openaiKey: '',
};
