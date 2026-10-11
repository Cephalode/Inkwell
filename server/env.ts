// Loads the repo-root .env into process.env (existing environment wins).
// Imported first by db.ts and src/storage.ts so PG* / SUPABASE_* vars are set
// before module-init code reads them. Dependency-free on purpose.
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

try {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env');
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const val = m[2].replace(/^["']|["']$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
} catch { /* no .env — fall back to built-in defaults */ }
