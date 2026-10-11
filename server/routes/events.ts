import { Router, type Request, type Response } from 'express';
import pool from '../db.js';
import { uid, requireUser } from '../src/auth.js';

const router = Router();

// POST /api/events — batch ingest from the client tracker.
// Mounted BEFORE the auth gate on purpose (see index.ts): pre-auth friction
// (sign-in loops, rage clicks on the gate) is exactly what we want to capture.
// user_id attaches from the session cookie when present, else 'shared'.
router.post('/events', async (req: Request, res: Response) => {
  const raw = Array.isArray(req.body?.events) ? req.body.events : [];
  // Trust-boundary validation: cap batch size and field lengths.
  const events = raw.slice(0, 500).filter((e: unknown) => !!e && typeof e === 'object');
  if (events.length === 0) return res.json({ inserted: 0 });

  const userId = uid(req);
  const sessionId = typeof req.body?.session_id === 'string' ? req.body.session_id.slice(0, 64) : null;
  const values: unknown[] = [];
  const tuples = (events as Record<string, unknown>[]).map((e, i) => {
    const ts = new Date(e.ts as string | number);
    values.push(
      userId,
      String(e.type ?? 'unknown').slice(0, 64),
      String(e.name ?? '').slice(0, 200),
      String(e.path ?? '').slice(0, 300),
      sessionId,
      JSON.stringify(typeof e.detail === 'object' && e.detail !== null ? e.detail : {}),
      isNaN(ts.getTime()) ? new Date() : ts,
    );
    const b = i * 7;
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6}::jsonb,$${b + 7})`;
  });

  try {
    await pool.query(
      `INSERT INTO events (user_id, type, name, path, session_id, detail, ts)
       VALUES ${tuples.join(',')}`,
      values,
    );
    res.json({ inserted: tuples.length });
  } catch (err) {
    console.error('[events] insert failed:', err);
    res.status(500).json({ error: 'insert failed' });
  }
});

// GET /api/events/recent?minutes=N — ad-hoc inspection for the agent.
router.get('/events/recent', requireUser, async (req: Request, res: Response) => {
  const minutes = Math.min(Math.max(parseInt(String(req.query.minutes) || '60', 10) || 60, 1), 10080);
  try {
    const result = await pool.query(
      `SELECT ts, user_id, session_id, type, name, path, detail
       FROM events WHERE ts > NOW() - ($1 || ' minutes')::interval ORDER BY ts LIMIT 5000`,
      [minutes],
    );
    res.json({ events: result.rows });
  } catch (err) {
    console.error('[events] read failed:', err);
    res.status(500).json({ error: 'read failed' });
  }
});

export default router;
