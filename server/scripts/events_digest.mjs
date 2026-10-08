#!/usr/bin/env node
// Inkwell observation pipeline — digest builder.
// Reads raw events from Postgres, aggregates into a JSON digest for the brief
// agent. Pure stdlib (node:pg comes from the app's node_modules).
// Usage: node scripts/events_digest.mjs [hours=24]
import { readFileSync } from 'node:fs';
import pg from 'pg';

const hours = parseInt(process.argv[2] || '24', 10) || 24;

// ponytail: env sourced from the app's .env by hand — dotenv not worth a dep.
const env = Object.fromEntries(
  readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
);

const pool = new pg.Pool({
  host: env.PGHOST || 'aws-0-us-east-2.pooler.supabase.com',
  port: parseInt(env.PGPORT || '5432', 10),
  database: env.PGDATABASE || 'postgres',
  user: env.PGUSER || 'postgres.mfbevwpwwcgzsrkbslrf',
  password: env.PGPASSWORD || '',
  ssl: env.PGSSL === 'false' ? undefined : { ca: readFileSync(new URL('../certs/supabase-root-2021.crt', import.meta.url)) },
  max: 2,
});

const { rows } = await pool.query(
  `SELECT ts, user_id, session_id, type, name, path, detail
   FROM events WHERE ts > NOW() - ($1 || ' hours')::interval ORDER BY ts`,
  [hours],
);
await pool.end();

// ── Aggregate ───────────────────────────────────────────────────────────────
const sessions = new Map(); // session_id -> { start, end, events, paths }
const clicks = new Map();   // "text" -> count
const dwell = new Map();    // path -> total ms
const api = new Map();      // "METHOD path" -> { n, err, maxMs }
const errors = new Map();   // message -> count (+ last stack)
const rageClicks = [];      // 5+ clicks same target within 3s
let lastClick = null;

for (const r of rows) {
  const t = new Date(r.ts).getTime();
  const sid = r.session_id || 'unknown';
  if (!sessions.has(sid)) sessions.set(sid, { start: r.ts, end: r.ts, events: 0, paths: new Set() });
  const s = sessions.get(sid);
  s.events++;
  if (t < new Date(s.start).getTime()) s.start = r.ts;
  if (t > new Date(s.end).getTime()) s.end = r.ts;
  if (r.path) s.paths.add(r.path);

  switch (r.type) {
    case 'click': {
      const key = (r.detail?.text || r.detail?.aria || r.name).slice(0, 40) || r.name;
      clicks.set(key, (clicks.get(key) || 0) + 1);
      if (lastClick && lastClick.key === key && t - lastClick.t < 3000) {
        lastClick.n++;
        if (lastClick.n === 5) rageClicks.push({ target: key, path: r.path, at: r.ts });
      } else {
        lastClick = { key, t, n: 1 };
      }
      break;
    }
    case 'dwell':
      dwell.set(r.name, (dwell.get(r.name) || 0) + (r.detail?.ms || 0));
      break;
    case 'heartbeat':
      dwell.set(r.name, (dwell.get(r.name) || 0) + 15000);
      break;
    case 'api': {
      const a = api.get(r.name) || { n: 0, err: 0, maxMs: 0 };
      a.n++;
      if ((r.detail?.status || 0) >= 400 || r.detail?.status === 0) a.err++;
      a.maxMs = Math.max(a.maxMs, r.detail?.ms || 0);
      api.set(r.name, a);
      break;
    }
    case 'error': {
      const e = errors.get(r.name) || { n: 0, stack: '', last: r.path };
      e.n++;
      if (!e.stack) e.stack = r.detail?.stack || '';
      errors.set(r.name, e);
      break;
    }
  }
}

const fmtMs = (ms) => (ms > 120000 ? `${Math.round(ms / 60000)}m` : `${Math.round(ms / 1000)}s`);
const digest = {
  window_hours: hours,
  generated_at: new Date().toISOString(),
  total_events: rows.length,
  sessions: [...sessions.entries()].map(([sid, s]) => ({
    session_id: sid,
    start: s.start,
    end: s.end,
    duration: fmtMs(new Date(s.end).getTime() - new Date(s.start).getTime()),
    events: s.events,
    paths: [...s.paths],
  })),
  top_clicks: [...clicks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => ({ target: k, count: n })),
  dwell_by_path: [...dwell.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([p, ms]) => ({ path: p, time: fmtMs(ms) })),
  api_health: [...api.entries()].filter(([, a]) => a.err > 0 || a.maxMs > 5000)
    .map(([k, a]) => ({ endpoint: k, calls: a.n, errors: a.err, max_ms: a.maxMs })),
  errors: [...errors.entries()].map(([msg, e]) => ({ message: msg, count: e.n, stack: e.stack, path: e.last })),
  rage_clicks: rageClicks,
};

console.log(JSON.stringify(digest, null, 2));
