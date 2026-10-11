import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db.js';
import { storageUpload } from '../src/storage.js';
import { BASE, fetchEnrolledCourses, fetchCourseOutline, fetchCoursePdfAssets, fetchAssetWithSize, fetchCourseId, isAuthError } from '../src/coursera.js';
import { extractTextFromPDF } from './documents.js';

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
    const courses = await fetchEnrolledCourses(cauth);
    const { rows } = await pool.query('SELECT coursera_slug FROM courses WHERE coursera_slug IS NOT NULL');
    const imported = new Set(rows.map((r: { coursera_slug: string }) => r.coursera_slug));
    res.json(courses.map((c) => ({ ...c, imported: imported.has(c.slug) })));
  } catch (err) {
    if (isAuthError(err)) return res.status(401).json({ error: 'Coursera session expired — relink the account' });
    res.status(502).json({ error: String(err) });
  }
});

// Import a Coursera course into the app's courses. Rejects a slug already
// imported so the Coursera tab can disable the button.
router.post('/import', async (req: Request, res: Response) => {
  const { slug, name } = req.body ?? {};
  if (!slug || !name) return res.status(400).json({ error: 'slug and name required' });
  try {
    const dupe = await pool.query('SELECT 1 FROM courses WHERE coursera_slug = $1', [slug]);
    if (dupe.rows.length > 0) return res.status(409).json({ error: 'Course already imported' });
    const id = `course_${Date.now()}`;
    const { rows } = await pool.query(
      `INSERT INTO courses (id, name, description, color, document_ids, coursera_slug)
       VALUES ($1, $2, $3, '', '[]', $4) RETURNING *`,
      [id, name, '', slug],
    );
    res.status(201).json({
      id: rows[0].id, name: rows[0].name, description: rows[0].description,
      color: rows[0].color, courseraSlug: rows[0].coursera_slug,
      documentIds: rows[0].document_ids ?? [], createdAt: rows[0].created_at, updatedAt: rows[0].updated_at,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
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

// ── POST /import-textbooks/:slug — download PDF textbooks into documents ──
// Scans course supplements for <asset extension="pdf"> tags, skips files under
// 1MB (howtos/guides), saves to Supabase Storage, attaches to the imported
// course, and marks coursera_asset_id so re-runs are idempotent.
router.post('/import-textbooks/:slug', async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  try {
    const cauth = await getCauth();
    if (!cauth) return res.status(401).json({ error: 'Coursera account not linked' });

    const { rows: courseRows } = await pool.query('SELECT id, document_ids FROM courses WHERE coursera_slug = $1', [slug]);
    if (courseRows.length === 0) return res.status(404).json({ error: 'Import the course first' });
    const course = courseRows[0] as { id: string; document_ids: string[] };

    const courseId = await fetchCourseId(cauth, slug);
    const modules = await fetchCourseOutline(cauth, slug);
    const supplementItemIds = modules.flatMap((m) => m.lessons.flatMap((l) => l.items.filter((i) => i.type === 'supplement').map((i) => i.id)));
    const assets = await fetchCoursePdfAssets(cauth, courseId, supplementItemIds);

    const { rows: existing } = await pool.query('SELECT coursera_asset_id FROM documents WHERE coursera_asset_id = ANY($1)', [assets.map((a) => a.id)]);
    const have = new Set(existing.map((r: { coursera_asset_id: string }) => r.coursera_asset_id));

    const attachToCourse = async (docId: string) => {
      const { rows } = await pool.query('SELECT document_ids FROM courses WHERE id = $1', [course.id]);
      const docIds = [...new Set([...((rows[0] as { document_ids: string[] }).document_ids ?? []), docId])];
      await pool.query('UPDATE courses SET document_ids = $1, updated_at = now() WHERE id = $2', [JSON.stringify(docIds), course.id]);
    };

    const importOne = async (assetId: string): Promise<string> => {
      const probe = await fetchAssetWithSize(cauth, assetId);
      if (!probe.ok) return `skipped (<1MB or unavailable): ${assetId}`;
      const fileName = (probe.name ?? `${assetId}.pdf`).replace(/[/\\:*?"<>|]/g, '_');
      const finalPath = `${uuidv4()}_${fileName}`;
      const dl = await fetch(`${BASE}/api/rest/v1/asset/download/pdf/${assetId}?pageStart=&pageEnd=`, { headers: { cookie: `CAUTH=${cauth}` } });
      if (!dl.ok || !(dl.headers.get('content-type') ?? '').includes('pdf')) return `failed (HTTP ${dl.status}): ${assetId}`;
      const buf = Buffer.from(await dl.arrayBuffer());
      if (buf.subarray(0, 5).toString() !== '%PDF-') return 'failed (not a PDF)';
      await storageUpload(finalPath, buf, 'application/pdf');
      const parsedText = await extractTextFromPDF(new Uint8Array(buf));
      const id = uuidv4();
      await pool.query(
        `INSERT INTO documents (id, name, type, mime_type, size, parsed_text, file_path, tags, coursera_asset_id)
         VALUES ($1, $2, 'pdf', 'application/pdf', $3, $4, $5, $6, $7)`,
        [id, fileName.replace(/\.pdf$/i, ''), buf.length, parsedText, finalPath, JSON.stringify(['Textbook', 'Coursera']), assetId],
      );
      await attachToCourse(id);
      return `imported: ${fileName} (${(buf.length / 1048576).toFixed(1)} MB)`;
    };

    const attachExisting = async (assetId: string, label: string): Promise<string> => {
      const { rows } = await pool.query('SELECT id FROM documents WHERE coursera_asset_id = $1', [assetId]);
      if (rows.length === 0) return `missing on disk: ${label}`;
      await attachToCourse(rows[0].id);
      return `already imported, attached: ${label}`;
    };

    const results: string[] = [];
    for (const a of assets) {
      if (have.has(a.id)) { results.push(await attachExisting(a.id, a.name)); continue; }
      results.push(await importOne(a.id));
    }
    res.json({ slug, assetCount: assets.length, results });
  } catch (err) {
    if (isAuthError(err)) return res.status(401).json({ error: 'Coursera session expired — relink the account' });
    console.error('import-textbooks failed:', err);
    res.status(502).json({ error: String(err) });
  }
});

export default router;
