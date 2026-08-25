import { Router, type Request, type Response } from 'express';
import pool from '../db.js';
import { fetchEnrolledCourses, fetchCourseOutline, isAuthError } from '../src/coursera.js';

const router = Router();

async function getCauth(): Promise<string | null> {
  const { rows } = await pool.query('SELECT cauth FROM coursera_account WHERE id = 1');
  return rows[0]?.cauth ?? null;
}

router.get('/status', async (_req: Request, res: Response) => {
  try {
    res.json({ linked: !!(await getCauth()) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/link', async (req: Request, res: Response) => {
  const cauth = String(req.body?.cauth ?? '').replace(/^CAUTH=/, '').trim();
  if (cauth.length < 100 || !/^[A-Za-z0-9._~+/=-]+$/.test(cauth)) {
    return res.status(400).json({ error: 'Paste the full CAUTH cookie value (DevTools → Application → Cookies → coursera.org)' });
  }
  try {
    const courses = await fetchEnrolledCourses(cauth);
    await pool.query(
      `INSERT INTO coursera_account (id, cauth, updated_at) VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET cauth = EXCLUDED.cauth, updated_at = now()`,
      [cauth],
    );
    res.json({ linked: true, courseCount: courses.length });
  } catch (err) {
    if (isAuthError(err)) return res.status(401).json({ error: 'Cookie rejected by Coursera — log in again and re-copy it' });
    res.status(502).json({ error: String(err) });
  }
});

router.delete('/link', async (_req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM coursera_account WHERE id = 1');
    res.json({ linked: false });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

async function requireCauth(res: Response): Promise<string | null> {
  const cauth = await getCauth();
  if (!cauth) {
    res.status(401).json({ error: 'Coursera account not linked' });
    return null;
  }
  return cauth;
}

router.get('/courses', async (_req: Request, res: Response) => {
  const cauth = await requireCauth(res);
  if (!cauth) return;
  try {
    res.json(await fetchEnrolledCourses(cauth));
  } catch (err) {
    if (isAuthError(err)) return res.status(401).json({ error: 'Coursera session expired — relink the account' });
    res.status(502).json({ error: String(err) });
  }
});

router.get('/courses/:slug/outline', async (req: Request, res: Response) => {
  const cauth = await requireCauth(res);
  if (!cauth) return;
  try {
    res.json(await fetchCourseOutline(cauth, String(req.params.slug)));
  } catch (err) {
    if (isAuthError(err)) return res.status(401).json({ error: 'Coursera session expired — relink the account' });
    res.status(502).json({ error: String(err) });
  }
});

export default router;
