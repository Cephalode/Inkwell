// One-off e2e: prove the exact call the iOS app now makes (cookie-authed
// POST /api/tts → MP3 bytes) works against prod. Creates a test session,
// synthesizes, deletes the session. Run: npx tsx server/scripts/e2e-tts-cookie.ts
import { createHash, randomBytes } from 'crypto';
import pool from '../db.js';
import '../env.js';

const BASE = 'https://inkwell.cephalode.com';
const token = randomBytes(32).toString('base64url');
const hashed = createHash('sha256').update(token).digest('hex');

const { rows: users } = await pool.query(
  `SELECT u.id, u.email FROM users u
     JOIN allowed_emails a ON a.email = u.email
    ORDER BY u.id LIMIT 1`,
);
if (!users[0]) throw new Error('no allowlisted user found');
console.log(`using user ${users[0].id}`);

await pool.query(
  `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
  [hashed, users[0].id],
);

try {
  // Raw-MP3 mode — exactly what APIClient.ttsAudio does.
  const res = await fetch(`${BASE}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `inkwell_session=${token}` },
    body: JSON.stringify({ text: 'Server voice parity check for the iOS read button.' }),
  });
  console.log('raw mode status:', res.status, res.headers.get('content-type'));
  if (!res.ok) throw new Error(`raw mode failed: ${res.status}`);
  const mp3 = Buffer.from(await res.arrayBuffer());
  const okMagic = mp3.length > 1000 && mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0;
  console.log(`raw mode: ${mp3.length} bytes, MPEG magic ${okMagic ? 'OK' : 'BAD'}`);
  if (!okMagic) throw new Error('not an MP3');

  // JSON words-marks mode — the web lesson read-aloud path.
  const res2 = await fetch(`${BASE}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Cookie: `inkwell_session=${token}` },
    body: JSON.stringify({ text: 'JSON mode check.' }),
  });
  const j = (await res2.json()) as { audio: string; marks: unknown[] };
  console.log('json mode status:', res2.status, '| audio bytes:', Math.round(j.audio.length * 0.75), '| marks:', j.marks.length);
  if (!res2.ok || !j.audio) throw new Error('json mode failed');
  console.log('E2E PASS — /api/tts serves the web voice to a cookie session');
} finally {
  await pool.query('DELETE FROM sessions WHERE token = $1', [hashed]);
  console.log('test session deleted');
  await pool.end();
}
