// Feature flags — read-time gating for new surfaces (E9).
// ponytail: no admin UI; flip flags with SQL. Add /admin/flags only when someone flips weekly.
import { Router, type Request, type Response } from 'express';
import pool from '../db.js';

const router = Router();

router.get('/flags', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT key, enabled FROM feature_flags');
    const flags: Record<string, boolean> = {};
    for (const r of rows) flags[r.key as string] = !!r.enabled;
    res.json({ flags });
  } catch (err) {
    console.error('flags read failed:', err);
    res.json({ flags: { learn_mode: true, chat_generators: true, podcast_v2: true } }); // fail open
  }
});

export default router;
