/**
 * Copy environment.example.ts → environment.ts (and .prod variant) when the
 * real files don't exist — used on CI (Vercel) where the secret-bearing
 * environment files are gitignored.
 *
 * Local dev: environment.ts already exists, this script is a no-op.
 * CI build : placeholder secrets get copied in so `ng build` can resolve
 *            the import. SSO won't actually work until real secrets land
 *            in that environment, but everything else (mock login, all
 *            talent/succession/admin UI) works fine.
 */
import { existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const envDir = join(here, '..', 'src', 'environments');

const pairs = [
  ['environment.example.ts',      'environment.ts'],
  ['environment.prod.example.ts', 'environment.prod.ts'],
];

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
  console.log(`[ensure-env] copied ${template} → ${target} (placeholder secrets)`);
}
