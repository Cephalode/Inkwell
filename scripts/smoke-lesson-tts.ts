// Smoke: open the live lesson step, start the Lesson activity, click Listen,
// verify /api/tts 200s and AUDIO ACTUALLY PLAYS (currentTime advances).
// Mints its own anonymous session — no hand-copied tokens.
// Throwaway — run with:  npx tsx scripts/smoke-lesson-tts.ts
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pgPkg from '../server/node_modules/pg/lib/index.js';
import { chromium } from '/Users/sqibo/.npm/_npx/8aba6135655dd455/node_modules/playwright/index.mjs';

const { Pool } = pgPkg;

// Load .env the same way server/env.ts does.
const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  const v = m[2].replace(/^["']|["']$/g, '');
  if (process.env[m[1]] === undefined) process.env[m[1]] = v;
}

// Mint an anonymous user + session (token stored sha256-hashed, like auth.ts).
const pool = new Pool({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || '5432', 10),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
});
const uid = 'anon_smoke_' + randomBytes(4).toString('hex');
await pool.query(
  'INSERT INTO users (id, email, is_anonymous) VALUES ($1, $2, true) ON CONFLICT DO NOTHING',
  [uid, uid + '@smoke.local'],
);
const rawToken = randomBytes(32).toString('hex');
const hashed = createHash('sha256').update(rawToken).digest('hex');
await pool.query(
  "INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, now() + interval '1 day')",
  [hashed, uid],
);
await pool.end();

const URL = 'https://inkwell.cephalode.com/learn/steps/c2b34156-15d7-4067-abb0-5edcd970874e';

const browser = await chromium.launch();
const page = await browser.newPage();
const ttsCalls: number[] = [];
page.on('response', (r) => {
  if (r.url().includes('/api/tts')) ttsCalls.push(r.status());
});
const errors: string[] = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.context().addCookies([{
  name: 'inkwell_session',
  value: rawToken,
  domain: '.inkwell.cephalode.com',
  path: '/',
  secure: true,
}]);
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('button', { timeout: 30000 });

// Start the lesson (strategy card with "Lesson")
const lessonBtn = page.locator('button', { hasText: 'Lesson' }).first();
try {
  await lessonBtn.click({ timeout: 10000 });
} catch {
  const btns = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.trim().slice(0, 30)),
  );
  console.log('buttons on page:', JSON.stringify(btns));
  process.exit(1);
}
await page.waitForTimeout(1500);

const listen = page.locator('button', { hasText: 'Listen' }).first();
if (!(await listen.isVisible())) {
  console.log('FAIL: Listen button not visible. H1:', await page.locator('h1').innerText().catch(() => 'no h1'));
  process.exit(1);
}
console.log('ok: Listen button visible');
await listen.click();

// Wait for TTS fetch (whole lesson = tens of seconds of audio).
for (let i = 0; i < 60 && !ttsCalls.length; i++) await page.waitForTimeout(2000);
console.log('tts responses:', ttsCalls.join(',') || 'NONE');

// Read playback state off the module-level Audio (exposed as __ttsAudio).
const grab = () => page.evaluate(() => {
  const a = (window as unknown as { __ttsAudio?: HTMLAudioElement }).__ttsAudio;
  return a ? { playing: !a.paused, t: a.currentTime, dur: a.duration } : null;
});
const st1 = await grab();
await page.waitForTimeout(4000);
const st2 = await grab();
console.log('audio t1:', JSON.stringify(st1), '| t2 (+4s):', JSON.stringify(st2));

const barVisible = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.fixed')).some((b) => b.textContent?.includes('Stop')),
);
console.log(barVisible ? 'ok: playback bar visible' : 'FAIL: playback bar not visible');

const playing = !!(st2 && st2.playing && st1 && st2.t > st1.t);
console.log(playing ? 'ok: audio playing (time advancing)' : 'FAIL: audio not advancing');
console.log(errors.length ? `console errors: ${errors.slice(0, 3).join(' | ')}` : 'ok: no console errors');

await browser.close();
const pass = ttsCalls.includes(200) && barVisible && playing;
console.log(pass ? 'SMOKE PASS' : 'SMOKE FAIL');
if (!pass) process.exit(1);
