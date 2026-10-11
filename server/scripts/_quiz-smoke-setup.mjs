// Smoke setup: anon user + session + a 3-question in_progress quiz on an existing step.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const envText = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const pool = new pg.Pool({
  host: process.env.PGHOST, port: parseInt(process.env.PGPORT || '5432', 10),
  database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
});

const uid = 'smoke-quiz-' + randomBytes(4).toString('hex');
const token = randomBytes(32).toString('base64url');
await pool.query(
  "INSERT INTO users (id, email, name) VALUES ($1, $2, 'Quiz Smoke')",
  [uid, uid + '@smoke.local'],
);
const exp = new Date(Date.now() + 3600_000);
await pool.query('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)', [token, uid, exp]);

const step = await pool.query('SELECT id FROM roadmap_steps ORDER BY created_at ASC LIMIT 1');
if (!step.rows[0]) throw new Error('no roadmap_steps found');
const stepId = step.rows[0].id;

const questions = [
  { id: 'q1', qtype: 'mcq', prompt: 'Smoke Q1: pick Alpha', options: ['Alpha', 'Beta', 'Gamma'] },
  { id: 'q2', qtype: 'true_false', prompt: 'Smoke Q2: true or false' },
  { id: 'q3', qtype: 'short_answer', prompt: 'Smoke Q3: type anything' },
];
const act = await pool.query(
  `INSERT INTO learning_activities (step_id, kind, status, content, started_at)
   VALUES ($1, 'quiz', 'in_progress', $2::jsonb, now()) RETURNING id`,
  [stepId, JSON.stringify({ questions })],
);

console.log(JSON.stringify({ uid, token, stepId, activityId: act.rows[0].id }));
await pool.end();
