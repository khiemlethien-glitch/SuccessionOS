/**
 * Copy environment.example.ts → environment.ts (and .prod variant) when the
 * real files don't exist — used on CI (Vercel) where the secret-bearing
 * environment files are gitignored.
 *
 * Optionally overrides placeholder secrets from process.env so Vercel can
 * inject real values via its Environment Variables dashboard.
 *
 * Supported env vars (all optional — only override what you set):
 *   SUPABASE_URL       → replaces `url` trong supabase block
 *   SUPABASE_ANON_KEY  → replaces `anonKey` trong supabase block
 *
 * Local dev: real env.ts exists → script is a no-op, nothing changes.
 */
import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const envDir = join(here, '..', 'src', 'environments');

const pairs = [
  ['environment.example.ts',      'environment.ts'],
  ['environment.prod.example.ts', 'environment.prod.ts'],
];

// Each entry has its own regex so context-sensitive keys (like `url`) are
// matched precisely — e.g. SUPABASE_URL only replaces `url:` inside the
// `supabase:` block, never the `api.url` that appears earlier in the file.
const replacements = {
  SUPABASE_URL:      { pattern: /(supabase:[\s\S]*?url:\s*)'[^']*'/,  value: process.env['SUPABASE_URL'] },
  SUPABASE_ANON_KEY: { pattern: /(anonKey:\s*)'[^']*'/,               value: process.env['SUPABASE_ANON_KEY'] },
  OPENAI_KEY:        { pattern: /(openaiKey:\s*)'[^']*'/,             value: process.env['OPENAI_KEY'] },
};

for (const [template, target] of pairs) {
  const templatePath = join(envDir, template);
  const targetPath   = join(envDir, target);

  if (existsSync(targetPath)) {
    console.log(`[ensure-env] ${target} exists — leaving it alone`);
    continue;
  }
  if (!existsSync(templatePath)) {
    console.warn(`[ensure-env] missing template ${template} — skipping`);
    continue;
  }

  copyFileSync(templatePath, targetPath);
  console.log(`[ensure-env] copied ${template} → ${target}`);

  // Inject env-var overrides into the freshly-copied file
  let patched = false;
  let content = readFileSync(targetPath, 'utf8');
  for (const [envName, { pattern, value }] of Object.entries(replacements)) {
    if (!value) continue;
    if (pattern.test(content)) {
      content = content.replace(pattern, `$1'${value.replace(/'/g, "\\'")}'`);
      console.log(`[ensure-env]   ↳ ${envName} applied`);
      patched = true;
    }
  }
  if (patched) writeFileSync(targetPath, content);
}
