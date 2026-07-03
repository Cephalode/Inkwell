import { Router, type Request, type Response } from 'express';
import pool from '../db.js';

const router = Router();

interface CourseRow {
  id: string;
  name: string;
  description: string;
  color: string;
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
    documentIds: row.document_ids ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM courses ORDER BY updated_at DESC');
    res.json(rows.map((r: CourseRow) => rowToCourse(r)));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM courses WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Course not found' });
    res.json(rowToCourse(rows[0] as CourseRow));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /
router.post('/', async (req: Request, res: Response) => {
  try {
    const { id, name, description = '', color = '', document_ids = [] } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO courses (id, name, description, color, document_ids) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, name, description, color, JSON.stringify(document_ids)]
    );
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
      const snake = key === 'documentIds' ? 'document_ids' : key;
      fields.push(`${snake} = $${i}`);
      values.push(key === 'documentIds' ? JSON.stringify(val) : val);
      i++;
    }
    fields.push(`updated_at = now()`);
    values.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE courses SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
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
    await pool.query('DELETE FROM courses WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
