import { readFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

// ── Load GLM_API_KEY ────────────────────────────────────────────────────────
// Priority: process.env > ~/.hermes/.env
let API_KEY: string | undefined = process.env.GLM_API_KEY;
if (!API_KEY) {
  try {
    const envPath = resolve(homedir(), '.hermes', '.env');
    const envFile = readFileSync(envPath, 'utf-8');
    const match = envFile.match(/^GLM_API_KEY=(.+)$/m);
    if (match) API_KEY = match[1].trim();
  } catch { /* file not found */ }
}

if (!API_KEY) {
  console.error('ERROR: GLM_API_KEY not found. Set it in process.env or ~/.hermes/.env');
  process.exit(1);
}

export const UPSTREAM = 'https://api.z.ai/api/coding/paas/v4/chat/completions';
export { API_KEY };
