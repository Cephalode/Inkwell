import { Router, type Request, type Response } from 'express';
import { unlinkSync, existsSync, readFileSync, statSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pool from '../db.js';

const router = Router();

// ── Helper: extract text from a PDF file on disk ──────────────────────────
async function extractTextFromPDF(filePath: string): Promise<string> {
  const data = new Uint8Array(readFileSync(filePath));
  const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  const texts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    texts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
  }
  return texts.join('\n');
}

// ── Row mappers ────────────────────────────────────────────────────────────
interface TextbookRow {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

function rowToTextbook(row: TextbookRow) {
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
    tags: row.tags,
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

// ── POST /api/documents/:id/convert-to-textbook ───────────────────────────
// Converts a document + its saved chapters into a textbook with individual
// chapter documents. Deletes the original document and its chapter records.
router.post('/documents/:id/convert-to-textbook', async (req: Request, res: Response) => {
  const parentId = req.params.id;

  try {
    // 1. Verify parent document exists
    const { rows: docRows } = await pool.query('SELECT * FROM documents WHERE id = $1', [parentId]);
    if (docRows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const parentDoc = docRows[0] as DocRow;

    // 2. Get all saved chapters
    const { rows: chapterRows } = await pool.query(
      'SELECT * FROM chapters WHERE parent_id = $1 ORDER BY chapter_index ASC',
      [parentId],
    );
    if (chapterRows.length === 0) {
      return res.status(400).json({ error: 'No saved chapters found. Save chapters first.' });
    }

    // 3. Create textbook record
    const textbookId = uuidv4();
    await pool.query(
      `INSERT INTO textbooks (id, name, description)
       VALUES ($1, $2, $3)`,
      [textbookId, parentDoc.name, ''],
    );

    // 4. Convert each chapter into a full document
    const createdDocs: ReturnType<typeof rowToDoc>[] = [];
    for (const ch of chapterRows) {
      const chRow = ch as {
        id: string;
        chapter_title: string;
        chapter_index: number;
        start_page: number;
        end_page: number;
        parsed_text: string;
        tags: unknown;
        file_path: string | null;
      };

      const docId = uuidv4();
      const chapterName = `${String(chRow.chapter_index + 1).padStart(2, '0')} ${chRow.chapter_title}.pdf`;

      // Extract text from chapter PDF if file exists
      let parsedText = chRow.parsed_text || '';
      let fileSize = 0;
      const chapterFilePath = chRow.file_path;

      if (chapterFilePath && existsSync(chapterFilePath)) {
        try {
          fileSize = statSync(chapterFilePath).size;
          parsedText = await extractTextFromPDF(chapterFilePath);
        } catch (err) {
          console.error(`Failed to extract text from chapter ${chRow.chapter_title}:`, err);
        }
      }

      // Insert as a new document, reusing the chapter's file path
      const { rows: newDocRows } = await pool.query(
        `INSERT INTO documents (id, name, type, mime_type, size, parsed_text, tags, file_path, textbook_id)
         VALUES ($1, $2, 'pdf', 'application/pdf', $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          docId,
          chapterName,
          fileSize,
          parsedText,
          chRow.tags ?? JSON.stringify(parentDoc.tags ?? []),
          chapterFilePath, // reuse the existing file (don't copy)
          textbookId,
        ],
      );
      createdDocs.push(rowToDoc(newDocRows[0] as DocRow));
    }

    // 5. Update courses: replace old document ID with textbook ID in document_ids
    const { rows: courseRows } = await pool.query(
      'SELECT id, document_ids FROM courses WHERE document_ids @> $1::jsonb',
      [JSON.stringify([parentId])],
    );
    for (const cr of courseRows) {
      const course = cr as { id: string; document_ids: string[] };
      const updatedIds = course.document_ids.map((id: string) => id === parentId ? textbookId : id);
      await pool.query(
        'UPDATE courses SET document_ids = $1::jsonb, updated_at = now() WHERE id = $2',
        [JSON.stringify(updatedIds), course.id],
      );
    }

    // 6. Delete chapter records (but NOT their files — we reused them above)
    await pool.query('DELETE FROM chapters WHERE parent_id = $1', [parentId]);

    // 7. Delete the original document
    const parentFilePath = parentDoc.file_path;
    await pool.query('DELETE FROM documents WHERE id = $1', [parentId]);
    if (parentFilePath && existsSync(parentFilePath)) {
      try { unlinkSync(parentFilePath); } catch { /* already deleted */ }
    }

    // 8. Return the textbook
    const { rows: tbRows } = await pool.query('SELECT * FROM textbooks WHERE id = $1', [textbookId]);
    res.status(201).json({
      ...rowToTextbook(tbRows[0] as TextbookRow),
      documents: createdDocs,
    });
  } catch (err: unknown) {
    console.error('Error converting to textbook:', err);
    res.status(500).json({ error: 'Failed to convert to textbook' });
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
