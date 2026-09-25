import { Router, type Request, type Response } from 'express';
import pool from '../db.js';
import { uid } from '../src/auth.js';

const router = Router();

interface CourseRow {
  id: string;
  name: string;
  description: string;
  color: string;
  coursera_slug: string | null;
  is_current: boolean;
  document_ids: unknown;
  created_at: string;
  updated_at: string;
}

function rowToCourse(row: CourseRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    courseraSlug: row.coursera_slug ?? undefined,
    isCurrent: row.is_current ?? false,
    documentIds: row.document_ids ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /
router.get('/', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM courses WHERE user_id = $1 ORDER BY updated_at DESC', [uid(req)]);
    res.json(rows.map((r: CourseRow) => rowToCourse(r)));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM courses WHERE id = $1 AND user_id = $2', [req.params.id, uid(req)]);
    if (rows.length === 0) return res.status(404).json({ error: 'Course not found' });
    res.json(rowToCourse(rows[0] as CourseRow));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /
router.post('/', async (req: Request, res: Response) => {
  try {
    const { id, name, description = '', color = '', document_ids = [], coursera_slug = null, is_current = false } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO courses (id, name, description, color, document_ids, coursera_slug, is_current, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [id, name, description, color, JSON.stringify(document_ids), coursera_slug, is_current, uid(req)]
    );
    if (is_current) {
      // ponytail: first current-course wins on a race; partial index keeps it single anyway
      await pool.query('UPDATE courses SET is_current = false WHERE user_id = $1 AND id <> $2', [uid(req), id]);
    }
    res.status(201).json(rowToCourse(rows[0] as CourseRow));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const [key, val] of Object.entries(req.body)) {
      const snake = { documentIds: 'document_ids', courseraSlug: 'coursera_slug', isCurrent: 'is_current' }[key] ?? key;
      fields.push(`${snake} = $${i}`);
      values.push(key === 'documentIds' ? JSON.stringify(val) : val);
      i++;
    }
    if (req.body.isCurrent === true) {
      // Switching the current course unsets the previous one first.
      await pool.query('UPDATE courses SET is_current = false WHERE user_id = $1 AND id <> $2', [uid(req), req.params.id]);
    }
    fields.push(`updated_at = now()`);
    values.push(req.params.id);
    values.push(uid(req));
    const { rows } = await pool.query(
      `UPDATE courses SET ${fields.join(', ')} WHERE id = $${i} AND user_id = $${i + 1} RETURNING *`,
      values
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Course not found' });
    res.json(rowToCourse(rows[0] as CourseRow));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM courses WHERE id = $1 AND user_id = $2', [req.params.id, uid(req)]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
