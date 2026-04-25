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

const replacements = {
  SUPABASE_URL:      { key: 'url',       value: process.env['SUPABASE_URL'] },
  SUPABASE_ANON_KEY: { key: 'anonKey',   value: process.env['SUPABASE_ANON_KEY'] },
  OPENAI_KEY:        { key: 'openaiKey', value: process.env['OPENAI_KEY'] },
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
  for (const [envName, { key, value }] of Object.entries(replacements)) {
    if (!value) continue;
    const pattern = new RegExp(`(${key}:\\s*)'[^']*'`);
    if (pattern.test(content)) {
      content = content.replace(pattern, `$1'${value.replace(/'/g, "\\'")}'`);
      console.log(`[ensure-env]   ↳ ${envName} applied → ${key}`);
      patched = true;
    }
  }
  if (patched) writeFileSync(targetPath, content);
}
