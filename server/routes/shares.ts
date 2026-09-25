// Share links: public read-only document pages (the Turbo-style viral loop).
// POST /api/documents/:id/share  — create (or reuse) a share token
// GET  /api/public/shares/:token — document + summary + podcast for a token
import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'crypto';
import pool from '../db.js';
import { uid } from '../src/auth.js';

const router = Router();

// POST /documents/:id/share — owner creates a share link
router.post('/documents/:id/share', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { rows: own } = await pool.query('SELECT id FROM documents WHERE id = $1 AND user_id = $2', [id, uid(req)]);
  if (own.length === 0) return res.status(404).json({ error: 'Document not found' });

  const existing = await pool.query('SELECT token FROM document_shares WHERE document_id = $1', [id]);
  if (existing.rows.length > 0) {
    return res.json({ token: (existing.rows[0] as { token: string }).token });
  }
  const token = randomBytes(16).toString('base64url');
  await pool.query('INSERT INTO document_shares (token, document_id) VALUES ($1, $2)', [token, id]);
  res.status(201).json({ token });
});

// GET /public/shares/:token — public read-only payload
router.get('/shares/:token', async (req: Request, res: Response) => {
  const { rows } = await pool.query(
    `SELECT d.id, d.name, d.type, d.summary, d.podcast_path, s.token
       FROM document_shares s JOIN documents d ON d.id = s.document_id
      WHERE s.token = $1`,
    [String(req.params.token)],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Share link not found' });
  const doc = rows[0] as { id: string; name: string; type: string; summary: string | null; podcast_path: string | null; token: string };
  res.json({
    name: doc.name,
    type: doc.type,
    summary: doc.summary,
    hasPodcast: !!doc.podcast_path,
    podcastUrl: doc.podcast_path ? `/api/public/shares/${doc.token}/podcast` : null,
  });
});

// GET /public/shares/:token/podcast — public podcast stream
router.get('/shares/:token/podcast', async (req: Request, res: Response) => {
  const { rows } = await pool.query(
    `SELECT d.podcast_path FROM document_shares s JOIN documents d ON d.id = s.document_id WHERE s.token = $1`,
    [String(req.params.token)],
  );
  const path = (rows[0] as { podcast_path: string | null } | undefined)?.podcast_path;
  if (!path) return res.status(404).json({ error: 'No podcast' });
  const { storageDownload } = await import('../src/storage.js');
  try {
    const buf = await storageDownload(path);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(buf.length));
    res.end(buf);
  } catch (err: unknown) {
    console.error('Share podcast stream failed:', err);
    res.status(500).json({ error: 'Stream failed' });
  }
});

export default router;
