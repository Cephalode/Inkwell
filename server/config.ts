import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Load GLM_API_KEY ────────────────────────────────────────────────────────
// Priority: process.env > project .env
let API_KEY: string | undefined = process.env.GLM_API_KEY;
if (!API_KEY) {
  try {
    const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env');
    const envFile = readFileSync(envPath, 'utf-8');
    API_KEY = envFile.match(/^GLM_API_KEY=(.+)$/m)?.[1].trim();
  } catch { /* no project .env */ }
}

if (!API_KEY) {
  console.error('ERROR: GLM_API_KEY not found. Set it in process.env or the project .env');
  process.exit(1);
}

// GLM_UPSTREAM lets a local mock or proxy stand in for the real API (tests, offline dev).
export const UPSTREAM = process.env.GLM_UPSTREAM || 'https://api.z.ai/api/coding/paas/v4/chat/completions';
export { API_KEY };
