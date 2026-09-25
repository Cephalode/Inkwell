// Folders (E1) — flat folders for organizing documents. CRUD only.
import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import pool from '../db.js';
import { uid } from '../src/auth.js';

const router = Router();

interface FolderRow {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}

router.get('/', async (req: Request, res: Response) => {
  const { rows } = await pool.query(
    'SELECT id, name, color, created_at FROM folders WHERE user_id = $1 ORDER BY created_at',
    [uid(req)],
  );
  res.json(rows.map((r: FolderRow) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    createdAt: new Date(r.created_at).getTime(),
  })));
});

router.post('/', async (req: Request, res: Response) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'name is required' });
  const color = typeof req.body?.color === 'string' ? req.body.color : null;
  const id = randomUUID();
  const { rows } = await pool.query(
    'INSERT INTO folders (id, user_id, name, color) VALUES ($1, $2, $3, $4) RETURNING id, name, color, created_at',
    [id, uid(req), name, color],
  );
  const r = rows[0] as FolderRow;
  res.status(201).json({ id: r.id, name: r.name, color: r.color, createdAt: new Date(r.created_at).getTime() });
});

router.delete('/:id', async (req: Request, res: Response) => {
  // Documents survive: folder_id FK is ON DELETE SET NULL.
  const { rowCount } = await pool.query('DELETE FROM folders WHERE id = $1 AND user_id = $2', [req.params.id, uid(req)]);
  if (!rowCount) return res.status(404).json({ error: 'Folder not found' });
  res.json({ ok: true });
});

export default router;
