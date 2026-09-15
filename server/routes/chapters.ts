import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import pool from '../db.js';
import { storageUpload, storageDelete } from '../src/storage.js';

const router = Router();

// ── Multer memory storage (files go to Supabase Storage) ───────────────────
const upload = multer({ storage: multer.memoryStorage() });

// ── Helper: snake_case → camelCase ─────────────────────────────────────────
interface ChapterRow {
  id: string;
  parent_id: string;
  chapter_title: string;
  chapter_index: number;
  start_page: number;
  end_page: number;
  parsed_text: string;
  tags: unknown;
  file_path: string | null;
  created_at: string;
  updated_at: string;
}

function rowToChapter(row: ChapterRow) {
  return {
    id: row.id,
    parentId: row.parent_id,
    chapterTitle: row.chapter_title,
    chapterIndex: Number(row.chapter_index),
    startPage: Number(row.start_page),
    endPage: Number(row.end_page),
    parsedText: row.parsed_text,
    tags: row.tags,
    filePath: row.file_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── GET /documents/:parentId/chapters — List chapters ────────────────────────
router.get('/documents/:parentId/chapters', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM chapters WHERE parent_id = $1 ORDER BY chapter_index',
      [req.params.parentId],
    );
    res.json(rows.map((r: ChapterRow) => rowToChapter(r)));
  } catch (err: unknown) {
    console.error('Error fetching chapters:', err);
    res.status(500).json({ error: 'Failed to fetch chapters' });
  }
});

// ── POST /documents/:parentId/chapters — Bulk upload chapters ────────────────
interface ChapterMetadata {
  chapterTitle: string;
  chapterIndex: number;
  startPage: number;
  endPage: number;
  parsedText?: string;
  tags?: string[];
}

router.post('/documents/:parentId/chapters', upload.array('files', 100), async (req: Request, res: Response) => {
  const parentId = req.params.parentId;
  const files = req.files as Express.Multer.File[] | undefined;
  const metadataStr = req.body.metadata as string | undefined;

  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  let metadata: ChapterMetadata[] = [];
  if (metadataStr) {
    try {
      metadata = JSON.parse(metadataStr);
    } catch {
      return res.status(400).json({ error: 'Invalid metadata JSON' });
    }
  }

  try {
    // Verify parent document exists
    const { rows: docRows } = await pool.query('SELECT id FROM documents WHERE id = $1', [parentId]);
    if (docRows.length === 0) {
      return res.status(404).json({ error: 'Parent document not found' });
    }

    const created: ReturnType<typeof rowToChapter>[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const meta = metadata[i] || {};
      const id = `${parentId}_ch${meta.chapterIndex ?? i}`;

      // Storage key mirrors the old on-disk name: {id}_{originalName}
      const finalPath = `${id}_${file.originalname}`;
      await storageUpload(finalPath, file.buffer, file.mimetype || 'application/octet-stream');

      await pool.query(
        `INSERT INTO chapters (id, parent_id, chapter_title, chapter_index, start_page, end_page, parsed_text, tags, file_path)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          parentId,
          meta.chapterTitle || file.originalname,
          meta.chapterIndex ?? i,
          meta.startPage ?? 0,
          meta.endPage ?? 0,
          meta.parsedText || '',
          JSON.stringify(meta.tags || []),
          finalPath,
        ],
      );

      const { rows } = await pool.query('SELECT * FROM chapters WHERE id = $1', [id]);
      created.push(rowToChapter(rows[0] as ChapterRow));
    }

    res.status(201).json(created);
  } catch (err: unknown) {
    console.error('Error creating chapters:', err);
    res.status(500).json({ error: 'Failed to create chapters' });
  }
});

// ── DELETE /documents/:parentId/chapters — Delete all chapters for parent ───
router.delete('/documents/:parentId/chapters', async (req: Request, res: Response) => {
  try {
    // Get file paths before deleting
    const { rows } = await pool.query(
      'SELECT file_path FROM chapters WHERE parent_id = $1',
      [req.params.parentId],
    );

    await pool.query('DELETE FROM chapters WHERE parent_id = $1', [req.params.parentId]);

    // Remove files from Storage
    for (const row of rows) {
      const filePath = (row as { file_path: string | null }).file_path;
      if (filePath) {
        try {
          await storageDelete(filePath);
        } catch {
          // File may already be deleted
        }
      }
    }

    res.status(204).end();
  } catch (err: unknown) {
    console.error('Error deleting chapters:', err);
    res.status(500).json({ error: 'Failed to delete chapters' });
  }
});

// ── GET /chapters/:id — Get single chapter ──────────────────────────────────
router.get('/chapters/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM chapters WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Chapter not found' });
    }
    res.json(rowToChapter(rows[0] as ChapterRow));
  } catch (err: unknown) {
    console.error('Error fetching chapter:', err);
    res.status(500).json({ error: 'Failed to fetch chapter' });
  }
});

export default router;
