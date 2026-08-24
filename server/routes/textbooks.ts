import { Router, type Request, type Response } from 'express';
import { unlinkSync } from 'fs';
import pool from '../db.js';

const router = Router();

// ── Row mappers ────────────────────────────────────────────────────────────
export interface TextbookRow {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export function rowToTextbook(row: TextbookRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Re-use the DocRow type from documents route
interface DocRow {
  id: string;
  name: string;
  type: string;
  mime_type: string;
  size: number;
  parsed_text: string;
  thumbnail: string;
  chapter_markers: unknown;
  tags: unknown;
  file_path: string | null;
  classify_status: string;
  video_summary: unknown;
  textbook_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToDoc(row: DocRow) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    mimeType: row.mime_type,
    size: Number(row.size),
    parsedText: row.parsed_text,
    thumbnail: row.thumbnail,
    chapterMarkers: row.chapter_markers,
    tags: row.tags ?? [],
    filePath: row.file_path,
    classifyStatus: row.classify_status,
    videoSummary: row.video_summary,
    textbookId: row.textbook_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── GET /api/textbooks — List all textbooks with their chapter documents ───
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { rows: textbooks } = await pool.query(
      'SELECT * FROM textbooks ORDER BY updated_at DESC',
    );

    const { rows: allDocs } = await pool.query(
      'SELECT * FROM documents WHERE textbook_id IS NOT NULL ORDER BY created_at ASC',
    );
    const docsByTextbook = new Map<string, DocRow[]>();
    for (const doc of allDocs as DocRow[]) {
      const key = doc.textbook_id as string;
      const list = docsByTextbook.get(key) ?? [];
      list.push(doc);
      docsByTextbook.set(key, list);
    }

    const result = textbooks.map((tb) => ({
      ...rowToTextbook(tb as TextbookRow),
      documents: (docsByTextbook.get((tb as TextbookRow).id) ?? []).map(rowToDoc),
    }));

    res.json(result);
  } catch (err: unknown) {
    console.error('Error fetching textbooks:', err);
    res.status(500).json({ error: 'Failed to fetch textbooks' });
  }
});

// ── GET /api/textbooks/:id — Get single textbook with documents ───────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM textbooks WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Textbook not found' });
    }

    const { rows: docs } = await pool.query(
      'SELECT * FROM documents WHERE textbook_id = $1 ORDER BY created_at ASC',
      [req.params.id],
    );

    res.json({
      ...rowToTextbook(rows[0] as TextbookRow),
      documents: (docs as DocRow[]).map(rowToDoc),
    });
  } catch (err: unknown) {
    console.error('Error fetching textbook:', err);
    res.status(500).json({ error: 'Failed to fetch textbook' });
  }
});

// ── DELETE /api/textbooks/:id — Delete textbook and all its documents ─────
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const textbookId = req.params.id;

    // Get document file paths before deleting
    const { rows: docRows } = await pool.query(
      'SELECT file_path FROM documents WHERE textbook_id = $1',
      [textbookId],
    );

    // Delete textbook (CASCADE deletes documents)
    await pool.query('DELETE FROM textbooks WHERE id = $1', [textbookId]);

    // Remove files from disk
    for (const row of docRows) {
      const filePath = (row as { file_path: string | null }).file_path;
      if (filePath) {
        try { unlinkSync(filePath); } catch { /* already deleted */ }
      }
    }

    res.status(204).end();
  } catch (err: unknown) {
    console.error('Error deleting textbook:', err);
    res.status(500).json({ error: 'Failed to delete textbook' });
  }
});

export default router;
