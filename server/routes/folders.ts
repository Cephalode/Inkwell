// Folders — hierarchical (Drive-style) tree. CRUD + PATCH rename/move.
// Cycle detection on move: a folder can never become a descendant of itself.
import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import pool from '../db.js';
import { uid } from '../src/auth.js';

const router = Router();

interface FolderRow {
  id: string;
  name: string;
  color: string | null;
  parent_id: string | null;
  created_at: string;
}

// A course folder is the folder a course auto-created for itself; it follows
// the course's name/color and can't be deleted independently of the course.
interface CourseFolderRow {
  folder_id: string;
  course_id: string;
}

function rowToFolder(r: FolderRow, courseId?: string | null) {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    parentId: r.parent_id,
    createdAt: new Date(r.created_at).getTime(),
    ...(courseId ? { courseId } : {}),
  };
}

type Folder = ReturnType<typeof rowToFolder>;

async function listFor(userId: string): Promise<Folder[]> {
  const { rows } = await pool.query<FolderRow>(
    'SELECT id, name, color, parent_id, created_at FROM folders WHERE user_id = $1 ORDER BY name COLLATE "C"',
    [userId],
  );
  const { rows: courseRows } = await pool.query<CourseFolderRow>(
    'SELECT folder_id, id AS course_id FROM courses WHERE user_id = $1 AND folder_id IS NOT NULL',
    [userId],
  );
  const courseByFolder = new Map<string, string>(courseRows.map((r) => [r.folder_id, r.course_id]));
  return rows.map((r) => rowToFolder(r, courseByFolder.get(r.id) ?? null));
}

// ── GET / — flat list including parentId (the client builds the tree) ───────
router.get('/', async (req: Request, res: Response) => {
  res.json(await listFor(uid(req)));
});

// ── GET /tree — folders augmented with computed counts + ancestry flags ──────
router.get('/tree', async (req: Request, res: Response) => {
  const userId = uid(req);
  const folders = await listFor(userId);

  // Direct document counts per folder (physical residents + soft-copy links).
  const { rows: docCounts } = await pool.query(
    `SELECT f_id AS folder_id, sum(n)::int AS n FROM (
       SELECT folder_id AS f_id, count(*) AS n FROM documents WHERE user_id = $1 AND folder_id IS NOT NULL GROUP BY folder_id
       UNION ALL
       SELECT l.folder_id AS f_id, count(*) AS n FROM document_folder_links l JOIN documents d ON d.id = l.document_id WHERE d.user_id = $1 GROUP BY l.folder_id
     ) t GROUP BY f_id`,
    [userId],
  );
  const direct: Record<string, number> = {};
  for (const r of docCounts as Array<{ folder_id: string; n: number }>) direct[r.folder_id] = r.n;

  interface TreeFolder extends Folder {
    docCount: number;
    hasChildren: boolean;
    isDescendantOf: Record<string, boolean>;
    courseId?: string;
  }
  const byId = new Map<string, TreeFolder>();
  for (const f of folders) {
    byId.set(f.id, { ...f, docCount: direct[f.id] ?? 0, hasChildren: false, isDescendantOf: {} });
  }
  for (const f of byId.values()) {
    if (f.parentId && byId.has(f.parentId)) byId.get(f.parentId)!.hasChildren = true;
  }
  // isDescendantOf[f.id][ancestorId] = true — the client greys out illegal move
  // targets (a folder can't move into its own subtree).
  for (const f of byId.values()) {
    let cur = f.parentId;
    const seen = new Set<string>();
    while (cur && byId.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      f.isDescendantOf[cur] = true;
      cur = byId.get(cur)!.parentId;
    }
  }

  res.json(Array.from(byId.values()));
});

// ── POST / — create folder (optionally nested) ───────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'name is required' });
  const color = typeof req.body?.color === 'string' ? req.body.color : null;
  const parentRaw = req.body?.parentId;
  const parentId = typeof parentRaw === 'string' && parentRaw.length > 0 ? parentRaw : null;
  if (parentId) {
    const { rowCount } = await pool.query('SELECT 1 FROM folders WHERE id = $1 AND user_id = $2', [parentId, uid(req)]);
    if (!rowCount) return res.status(400).json({ error: 'Parent folder not found' });
  }
  const id = randomUUID();
  const { rows } = await pool.query(
    'INSERT INTO folders (id, user_id, name, color, parent_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, color, parent_id, created_at',
    [id, uid(req), name, color, parentId],
  );
  res.status(201).json(rowToFolder(rows[0] as FolderRow));
});

// ── PATCH /:id — rename and/or move ──────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (typeof req.body?.name === 'string' && req.body.name.trim()) {
    sets.push(`name = $${i++}`);
    values.push(req.body.name.trim());
  }
  if (typeof req.body?.color === 'string') {
    sets.push(`color = $${i++}`);
    values.push(req.body.color);
  }
  if ('parentId' in (req.body ?? {})) {
    const raw = req.body.parentId;
    const newParent = typeof raw === 'string' && raw.length > 0 ? raw : null;
    if (newParent === id) {
      return res.status(400).json({ error: 'A folder cannot be its own parent' });
    }
    if (newParent) {
      const { rowCount } = await pool.query('SELECT 1 FROM folders WHERE id = $1 AND user_id = $2', [newParent, uid(req)]);
      if (!rowCount) return res.status(400).json({ error: 'Parent folder not found' });
      // Cycle check: walk up from the new parent; if we reach this folder, the
      // move would create a loop (the folder would become its own ancestor).
      interface ParentRow { parent_id: string | null }
      let cur: string | null = newParent;
      const seen = new Set<string>();
      while (cur) {
        if (cur === id) return res.status(400).json({ error: 'Cannot move a folder into its own subtree' });
        if (seen.has(cur)) break;
        seen.add(cur);
        const found: { rows: ParentRow[] } = await pool.query<ParentRow>(
          'SELECT parent_id FROM folders WHERE id = $1 AND user_id = $2',
          [cur, uid(req)],
        );
        if (found.rows.length === 0) break;
        cur = found.rows[0].parent_id;
      }
    }
    sets.push(`parent_id = $${i++}`);
    values.push(newParent);
  }

  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
  values.push(id, uid(req));
  const { rows } = await pool.query(
    `UPDATE folders SET ${sets.join(', ')} WHERE id = $${i} AND user_id = $${i + 1} RETURNING id, name, color, parent_id, created_at`,
    values,
  );
  if (!rows.length) return res.status(404).json({ error: 'Folder not found' });
  res.json(rowToFolder(rows[0] as FolderRow));
});

// ── DELETE /:id — delete folder; documents & child folders are promoted ──────
router.delete('/:id', async (req: Request, res: Response) => {
  const { rowCount } = await pool.query('DELETE FROM folders WHERE id = $1 AND user_id = $2', [req.params.id, uid(req)]);
  if (!rowCount) return res.status(404).json({ error: 'Folder not found' });
  // Subtree folders got parent_id = NULL (SET NULL); documents got folder_id = NULL.
  // The client refreshes the whole tree after a delete, so no promoted list needed.
  res.json({ ok: true });
});

// ── GET /:id/documents — residents + soft-copy links for the file pane ──────
// Rows are tagged `isLink` so the client can badge soft copies. Physical
// residents win when a doc is both (PK makes double-linking impossible).
router.get('/:id/documents', async (req: Request, res: Response) => {
  const userId = uid(req);
  const id = String(req.params.id);
  const owned = await pool.query('SELECT 1 FROM folders WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!owned.rowCount) return res.status(404).json({ error: 'Folder not found' });
  const { rows } = await pool.query(
    `SELECT d.id, CASE WHEN d.folder_id = $1 THEN false ELSE true END AS is_link
       FROM documents d
       LEFT JOIN document_folder_links l ON l.document_id = d.id AND l.folder_id = $1
      WHERE d.user_id = $2 AND (d.folder_id = $1 OR l.folder_id IS NOT NULL)`,
    [id, userId],
  );
  res.json(rows as Array<{ id: string; isLink: boolean }>);
});

// ── POST /:id/links — create a soft-copy link (no physical move) ─────────────
router.post('/:id/links', async (req: Request, res: Response) => {
  const userId = uid(req);
  const folderId = String(req.params.id);
  const documentId = typeof req.body?.documentId === 'string' ? req.body.documentId : '';
  if (!documentId) return res.status(400).json({ error: 'documentId is required' });
  const { rowCount: docOk } = await pool.query('SELECT 1 FROM documents WHERE id = $1 AND user_id = $2', [documentId, userId]);
  if (!docOk) return res.status(404).json({ error: 'Document not found' });
  const { rowCount: folderOk } = await pool.query('SELECT 1 FROM folders WHERE id = $1 AND user_id = $2', [folderId, userId]);
  if (!folderOk) return res.status(404).json({ error: 'Folder not found' });
  try {
    await pool.query('INSERT INTO document_folder_links (document_id, folder_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [documentId, folderId]);
  } catch (err: unknown) {
    console.error('Error linking document to folder:', err);
    return res.status(500).json({ error: 'Failed to link document' });
  }
  res.status(201).json({ ok: true });
});

// ── DELETE /:id/links/:documentId — remove a soft-copy link ──────────────────
router.delete('/:id/links/:documentId', async (req: Request, res: Response) => {
  const { rowCount } = await pool.query(
    `DELETE FROM document_folder_links l USING folders f, documents d
      WHERE l.folder_id = f.id AND l.document_id = d.id
        AND l.folder_id = $1 AND l.document_id = $2 AND f.user_id = $3 AND d.user_id = $3`,
    [String(req.params.id), String(req.params.documentId), uid(req)],
  );
  if (!rowCount) return res.status(404).json({ error: 'Link not found' });
  res.json({ ok: true });
});

export default router;
