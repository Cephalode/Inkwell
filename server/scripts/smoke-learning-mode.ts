// Smoke: learning-mode round-trip against the running dev server with a real session.
import '../env.js';
import pool from '../db.js';
import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';

const newToken = () => randomBytes(32).toString('base64url');
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

const u = (await pool.query('SELECT id FROM users ORDER BY created_at DESC LIMIT 1')).rows[0];
if (!u) { console.log('no users in db'); process.exit(0); }
const token = newToken();
await pool.query(`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')`, [hashToken(token), u.id]);

const call = (path: string, method = 'GET', body?: unknown) =>
  new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        host: 'localhost',
        port: 3002, // the API server — vite (3001) proxies /api here
        path,
        method,
        headers: {
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
          Cookie: `inkwell_session=${token}`,
        },
      },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => resolve({ status: res.statusCode, body: b }));
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });

console.log('GET :', (await call('/api/auth/learning-mode')).body);
console.log('PUT :', (await call('/api/auth/learning-mode', 'PUT', { mode: 'flow' })).body);
console.log('GET :', (await call('/api/auth/learning-mode')).body);
console.log('PUT :', (await call('/api/auth/learning-mode', 'PUT', { mode: 'legacy' })).body);
console.log('GET :', (await call('/api/auth/learning-mode')).body);

await pool.query('DELETE FROM sessions WHERE token = $1', [hashToken(token)]);
await pool.end();
