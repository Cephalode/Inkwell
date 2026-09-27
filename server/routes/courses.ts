import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
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
  folder_id: string | null;
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
    folderId: row.folder_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Course folder provisioning ────────────────────────────────────────────────
// Every course owns a folder in the documents tree. Legacy courses (created
// before folders existed) get one lazily the next time they're touched.
async function ensureCourseFolder(userId: string, courseId: string): Promise<string> {
  const { rows } = await pool.query<{ folder_id: string | null; name: string; color: string }>(
    'SELECT folder_id, name, color FROM courses WHERE id = $1 AND user_id = $2',
    [courseId, userId],
  );
  if (!rows.length) throw new Error('Course not found');
  const { folder_id: existing, name, color } = rows[0];
  if (existing && (await pool.query('SELECT 1 FROM folders WHERE id = $1', [existing])).rowCount) return existing;
  // Folder row missing (legacy course, or deleted by hand) — recreate.
  const folderId = randomUUID();
  await pool.query('INSERT INTO folders (id, user_id, name, color) VALUES ($1, $2, $3, $4)', [folderId, userId, name, color || null]);
  await pool.query('UPDATE courses SET folder_id = $1 WHERE id = $2 AND user_id = $3', [folderId, courseId, userId]);
  return folderId;
}

// Keep the course folder in sync with the course's name/color.
async function syncCourseFolder(userId: string, courseId: string, name: string, color: string | null): Promise<void> {
  await pool.query('UPDATE folders SET name = $1, color = $2 WHERE id = (SELECT folder_id FROM courses WHERE id = $3 AND user_id = $4)', [name, color || null, courseId, userId]);
}

// If a document physically lives in `fromFolderId` (a course folder) but that
// course no longer lists it, move it to the next-oldest course that still
// lists it — or to root when none does.
async function rehomeDoc(userId: string, documentId: string, fromFolderId: string): Promise<void> {
  const { rows } = await pool.query<{ folder_id: string }>(
    `SELECT c.folder_id FROM courses c
       JOIN jsonb_array_elements_text(c.document_ids) WITH ORDINALITY AS t(doc_id, ord) ON t.doc_id = $2
      WHERE c.user_id = $1 AND c.folder_id IS NOT NULL AND c.folder_id <> $3
      ORDER BY c.created_at ASC, t.ord ASC LIMIT 1`,
    [userId, documentId, fromFolderId],
  );
  const next = rows[0]?.folder_id ?? null;
  await pool.query(
    'UPDATE documents SET folder_id = $1 WHERE user_id = $2 AND id = $3 AND folder_id = $4',
    [next, userId, documentId, fromFolderId],
  );
}

/**
 * Assign a document to a course folder under the soft-copy model:
 * the first course (by creation order) claims the document physically
 * (documents.folder_id); every other course gets a soft-copy link row.
 * Both cases end up visible inside the course's folder.
 */
async function assignDocToCourseFolder(userId: string, courseId: string, documentId: string): Promise<void> {
  const folderId = await ensureCourseFolder(userId, courseId);
  const { rows } = await pool.query<{ folder_id: string | null }>(
    `SELECT c.folder_id FROM courses c
       JOIN jsonb_array_elements_text(c.document_ids) WITH ORDINALITY AS t(doc_id, ord) ON t.doc_id = $2
      WHERE c.user_id = $1 AND c.folder_id IS NOT NULL
      ORDER BY c.created_at ASC, t.ord ASC
      LIMIT 1`,
    [userId, documentId],
  );
  const ownerFolderId = rows[0]?.folder_id ?? null;
  if (ownerFolderId && ownerFolderId !== folderId) {
    // An older course claims this document — soft-link it into this folder.
    await pool.query('INSERT INTO document_folder_links (document_id, folder_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [documentId, folderId]);
    return;
  }
  // This course is the oldest claimant (or no course claims it yet) — it hosts
  // the document physically. Idempotent: also repairs legacy NULL folder_id.
  await pool.query('UPDATE documents SET folder_id = $1 WHERE id = $2 AND user_id = $3', [folderId, documentId, userId]);
}

// GET /
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = uid(req);
    const { rows } = await pool.query('SELECT * FROM courses WHERE user_id = $1 ORDER BY updated_at DESC', [userId]);
    // Self-heal legacy courses that predate folder provisioning.
    for (const r of rows as CourseRow[]) {
      if (!r.folder_id || !(await pool.query('SELECT 1 FROM folders WHERE id = $1', [r.folder_id])).rowCount) {
        r.folder_id = await ensureCourseFolder(userId, r.id);
      }
    }
    res.json(rows.map((r: CourseRow) => rowToCourse(r)));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = uid(req);
    const { rows } = await pool.query('SELECT * FROM courses WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Course not found' });
    const r = rows[0] as CourseRow;
    if (!r.folder_id || !(await pool.query('SELECT 1 FROM folders WHERE id = $1', [r.folder_id])).rowCount) {
      r.folder_id = await ensureCourseFolder(userId, r.id);
    }
    res.json(rowToCourse(r));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /
router.post('/', async (req: Request, res: Response) => {
  try {
    const { id, name, description = '', color = '', document_ids = [], coursera_slug = null, is_current = false } = req.body;
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Course name is required' });
    const userId = uid(req);
    const { rows } = await pool.query(
      'INSERT INTO courses (id, name, description, color, document_ids, coursera_slug, is_current, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [id, name, description, color, JSON.stringify(document_ids), coursera_slug, is_current, userId]
    );
    if (is_current) {
      // ponytail: first current-course wins on a race; partial index keeps it single anyway
      await pool.query('UPDATE courses SET is_current = false WHERE user_id = $1 AND id <> $2', [userId, id]);
    }
    // Every course gets a folder in the documents tree, automatically.
    const course = rows[0] as CourseRow;
    course.folder_id = await ensureCourseFolder(userId, id);
    res.status(201).json(rowToCourse(course));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const userId = uid(req);
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
      await pool.query('UPDATE courses SET is_current = false WHERE user_id = $1 AND id <> $2', [userId, req.params.id]);
    }
    fields.push(`updated_at = now()`);
    values.push(req.params.id);
    values.push(userId);
    const { rows } = await pool.query(
      `UPDATE courses SET ${fields.join(', ')} WHERE id = $${i} AND user_id = $${i + 1} RETURNING *`,
      values
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Course not found' });
    const course = rows[0] as CourseRow;
    // Rename/recolor propagate to the course's folder in the documents tree.
    await syncCourseFolder(userId, course.id, course.name, course.color);
    if (Array.isArray(req.body.documentIds)) {
      // Converge folder state for every assigned doc (idempotent): newest
      // claims, older courses soft-link, docs the course no longer lists get
      // pruned/rehomed above. Covers both new assignments and legacy rows.
      const wanted = new Set<string>(req.body.documentIds as string[]);
      const { rows: linkRows } = await pool.query<{ document_id: string }>(
        'SELECT l.document_id FROM document_folder_links l JOIN courses c ON c.folder_id = l.folder_id WHERE c.id = $1 AND c.user_id = $2',
        [course.id, userId],
      );
      for (const { document_id } of linkRows) {
        if (!wanted.has(document_id)) {
          await pool.query(
            'DELETE FROM document_folder_links WHERE document_id = $1 AND folder_id = (SELECT folder_id FROM courses WHERE id = $2 AND user_id = $3)',
            [document_id, course.id, userId],
          );
        }
      }
      // If this course physically owned a doc it no longer lists, hand it to
      // the next-oldest course that does (or drop it to root).
      const { rows: ownRows } = await pool.query<{ id: string }>(
        'SELECT d.id FROM documents d JOIN courses c ON c.folder_id = d.folder_id WHERE c.id = $1 AND c.user_id = $2',
        [course.id, userId],
      );
      const { rows: folderRows } = await pool.query<{ folder_id: string | null }>(
        'SELECT folder_id FROM courses WHERE id = $1 AND user_id = $2',
        [course.id, userId],
      );
      const ownFolderId = folderRows[0]?.folder_id ?? null;
      if (ownFolderId) {
        for (const { id: docId } of ownRows) {
          if (!wanted.has(docId)) await rehomeDoc(userId, docId, ownFolderId);
        }
      }
      for (const docId of wanted) {
        await assignDocToCourseFolder(userId, course.id, docId);
      }
    }
    res.json(rowToCourse(course));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = uid(req);
    // Physical residents of the course folder are rehomed: the next-oldest
    // course that still lists the document claims them; strays go to root.
    // Soft links into this folder die with it (folder FK ON DELETE CASCADE).
    const { rows: dyingFolder } = await pool.query<{ folder_id: string | null }>(
      'SELECT folder_id FROM courses WHERE id = $1 AND user_id = $2',
      [req.params.id, userId],
    );
    const folderId = dyingFolder[0]?.folder_id;
    if (folderId) {
      const { rows: residents } = await pool.query<{ id: string }>(
        'SELECT id FROM documents WHERE user_id = $1 AND folder_id = $2',
        [userId, folderId],
      );
      for (const { id: docId } of residents) await rehomeDoc(userId, docId, folderId);
    }
    await pool.query('DELETE FROM courses WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
