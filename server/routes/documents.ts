import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'path';
import { unlinkSync, existsSync, createReadStream } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { renameSync } from 'fs';
import pool from '../db.js';
import { API_KEY, UPSTREAM } from '../config.js';

const router = Router();

const __dirname = path.join(new URL('.', import.meta.url).pathname, '..', 'data', 'files');

// ── Multer disk storage ──────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, __dirname);
  },
  filename: (_req, file, cb) => {
    // Use a temp prefix to avoid collisions; renamed after we have the UUID
    cb(null, `tmp_${Date.now()}_${file.originalname}`);
  },
});

const upload = multer({ storage });

// ── Helper: snake_case → camelCase ──────────────────────────────────────────
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── POST / — Upload a document ─────────────────────────────────────────────
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const id = uuidv4();
  const name = file.originalname;
  const ext = path.extname(name).slice(1).toLowerCase() || 'bin';
  const mimeType = file.mimetype;
  const size = file.size;

  // Rename from temp name to UUID-based final name
  const finalPath = path.join(__dirname, `${id}_${name}`);
  renameSync(file.path, finalPath);

  try {
    await pool.query(
      `INSERT INTO documents (id, name, type, mime_type, size, file_path)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, name, ext, mimeType, size, finalPath],
    );

    const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
    res.status(201).json(rowToDoc(rows[0] as DocRow));
  } catch (err: unknown) {
    console.error('Error inserting document:', err);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

// ── GET / — List all documents ─────────────────────────────────────────────
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM documents ORDER BY created_at DESC');
    res.json(rows.map((r) => rowToDoc(r as DocRow)));
  } catch (err: unknown) {
    console.error('Error fetching documents:', err);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// ── GET /:id/download — Download raw PDF file ──────────────────────────────
router.get('/:id/download', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const doc = rows[0] as DocRow;
    const filePath = doc.file_path;
    if (!filePath || !existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }
    res.setHeader('Content-Type', doc.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${doc.name}"`);
    createReadStream(filePath).pipe(res);
  } catch (err: unknown) {
    console.error('Error downloading document file:', err);
    res.status(500).json({ error: 'Failed to download document file' });
  }
});

// ── GET /:id — Get single document ──────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(rowToDoc(rows[0] as DocRow));
  } catch (err: unknown) {
    console.error('Error fetching document:', err);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// ── PATCH /:id — Update document fields (tags, parsedText, thumbnail, chapterMarkers) ──
router.patch('/:id', async (req: Request, res: Response) => {
  const { tags, parsedText, thumbnail, chapterMarkers } = req.body;

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (Array.isArray(tags)) {
    sets.push(`tags = $${i++}`);
    values.push(JSON.stringify(tags));
  }
  if (typeof parsedText === 'string') {
    sets.push(`parsed_text = $${i++}`);
    values.push(parsedText);
  }
  if (typeof thumbnail === 'string' || thumbnail === null) {
    sets.push(`thumbnail = $${i++}`);
    values.push(thumbnail);
  }
  if (Array.isArray(chapterMarkers)) {
    sets.push(`chapter_markers = $${i++}`);
    values.push(JSON.stringify(chapterMarkers));
  }
  if (typeof req.body.name === 'string') {
    sets.push(`name = $${i++}`);
    values.push(req.body.name as string);
  }

  if (sets.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  sets.push(`updated_at = now()`);
  values.push(req.params.id);

  try {
    const { rows } = await pool.query(
      `UPDATE documents SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      values,
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(rowToDoc(rows[0] as DocRow));
  } catch (err: unknown) {
    console.error('Error updating document:', err);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// ── DELETE /:id — Delete document ──────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT file_path FROM documents WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Remove chapter files from disk (FK CASCADE deletes the rows)
    const { rows: chapterRows } = await pool.query(
      'SELECT file_path FROM chapters WHERE parent_id = $1',
      [req.params.id],
    );
    for (const row of chapterRows) {
      const chPath = (row as { file_path: string | null }).file_path;
      if (chPath) {
        try { unlinkSync(chPath); } catch { /* already deleted */ }
      }
    }

    await pool.query('DELETE FROM documents WHERE id = $1', [req.params.id]);

    // Remove file from disk
    const filePath = (rows[0] as { file_path: string | null }).file_path;
    if (filePath) {
      try {
        unlinkSync(filePath);
      } catch {
        // File may already be deleted
      }
    }

    res.status(204).end();
  } catch (err: unknown) {
    console.error('Error deleting document:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// ── POST /:id/classify — Classify document via GLM API ──────────────────────
const VALID_LABELS = new Set([
  'Textbook', 'Worksheet', 'Exam', 'Quiz', 'Notes', 'Slides', 'Reference',
  'Article', 'Paper', 'Lab Manual', 'Syllabus', 'Study Guide', 'Handout',
  'Diagram', 'Code', 'Unknown',
]);

const VALID_SUBJECTS = new Set([
  'Mathematics', 'Biology', 'Chemistry', 'Physics', 'Computer Science',
  'Geology', 'Seismology', 'Earth Science', 'Environmental Science', 'History',
  'Literature', 'Economics', 'Psychology', 'Philosophy', 'Engineering',
  'Medicine', 'Law', 'Linguistics', 'Art', 'Music', 'Statistics', 'Geography',
  'Political Science', 'General',
]);

const CLASSIFY_SYSTEM_PROMPT = `You classify educational documents. Given the text below, respond with ONLY a JSON object — no explanation, no markdown fences.

{
  "label": "<one of: Textbook, Worksheet, Exam, Quiz, Notes, Slides, Reference, Article, Paper, Lab Manual, Syllabus, Study Guide, Handout, Diagram, Code, Unknown>",
  "subject": "<one of: Mathematics, Biology, Chemistry, Physics, Computer Science, Geology, Seismology, Earth Science, Environmental Science, History, Literature, Economics, Psychology, Philosophy, Engineering, Medicine, Law, Linguistics, Art, Music, Statistics, Geography, Political Science, General>",
  "confidence": <0.0 to 1.0>,
  "title": "<concise descriptive filename: 3-6 words, no file extension, no quotes, no special characters. Capture the topic/subject clearly. E.g. 'ISLR Statistical Learning', 'Earthquake Analysis Methods', 'Intro to Algorithms'>"
}

If the text is too short or unclear to classify, set label to "Unknown" and subject to "General" and leave title empty.`;

router.post('/:id/classify', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    // 1. Fetch document from DB
    const { rows } = await pool.query('SELECT parsed_text FROM documents WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const parsedText = (rows[0] as { parsed_text: string | null }).parsed_text;

    // 2. If parsed_text is empty/missing, skip
    if (!parsedText || parsedText.trim().length === 0) {
      await pool.query(
        "UPDATE documents SET classify_status = 'skipped' WHERE id = $1",
        [id],
      );
      return res.json({ label: 'Unknown', subject: 'General', confidence: 0, status: 'skipped' });
    }

    // 3-5. Call GLM API
    const excerpt = parsedText.slice(0, 1500);
    const resp = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: 'glm-5.1',
        temperature: 0.3,
        max_tokens: 2048,
        stream: false,
        messages: [
          { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
          { role: 'user', content: `Classify this document:\n\n${excerpt}` },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`Classify upstream error ${resp.status}: ${errText.slice(0, 200)}`);
      await pool.query(
        "UPDATE documents SET classify_status = 'skipped' WHERE id = $1",
        [id],
      );
      return res.json({ label: 'Unknown', subject: 'General', confidence: 0, status: 'skipped' });
    }

    const data = await resp.json() as {
      choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
    };

    // 6. Extract response content — fall back to reasoning_content
    let raw = data.choices?.[0]?.message?.content || '';
    if (!raw) {
      raw = data.choices?.[0]?.message?.reasoning_content || '';
    }

    // 7. Strip markdown fences
    raw = raw.trim();
    raw = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
    raw = raw.trim();

    // 8. JSON parse and validate
    let label = 'Unknown';
    let subject = 'General';
    let confidence = 0;

    let title = '';
    try {
      const parsed = JSON.parse(raw) as { label?: string; subject?: string; confidence?: number; title?: string };
      if (parsed.label && VALID_LABELS.has(parsed.label)) label = parsed.label;
      if (parsed.subject && VALID_SUBJECTS.has(parsed.subject)) subject = parsed.subject;
      if (typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1) {
        confidence = parsed.confidence;
      }
      if (typeof parsed.title === 'string' && parsed.title.trim().length > 0) {
        title = parsed.title.trim().replace(/[/\\:*?"<>|]/g, '');
      }
    } catch {
      // JSON parse failed — keep Unknown/General defaults
    }

    // 9-10. Update DB based on classification result
    const isUsable = label !== 'Unknown' && subject !== 'General';
    if (isUsable) {
      // Build SET clause — optionally include name rename
      const sets: string[] = ["tags = $1::jsonb", "classify_status = 'done'"];
      const values: unknown[] = [JSON.stringify([label, subject])];
      let nextIdx = 2;

      if (title) {
        // Fetch current name to preserve extension
        const { rows: nameRows } = await pool.query('SELECT name, file_path FROM documents WHERE id = $1', [id]);
        const oldName = (nameRows[0] as { name: string }).name;
        const ext = path.extname(oldName);
        const newName = title + ext;

        sets.push(`name = $${nextIdx++}`);
        values.push(newName);

        // Rename file on disk
        const oldPath = (nameRows[0] as { file_path: string | null }).file_path;
        if (oldPath && existsSync(oldPath)) {
          const dir = path.dirname(oldPath);
          const newFilePath = path.join(dir, `${id}_${newName}`);
          try {
            renameSync(oldPath, newFilePath);
            sets.push(`file_path = $${nextIdx++}`);
            values.push(newFilePath);
          } catch {
            // rename failed — still update DB name
          }
        }
      }

      values.push(id);
      await pool.query(
        `UPDATE documents SET ${sets.join(', ')} WHERE id = $${nextIdx}`,
        values,
      );
    } else {
      await pool.query(
        "UPDATE documents SET classify_status = 'skipped' WHERE id = $1",
        [id],
      );
    }

    // 12. Return result
    res.json({ label, subject, confidence, title, status: isUsable ? 'done' : 'skipped' });
  } catch (err: unknown) {
    // 11. On any error, set classify_status = 'skipped' so it doesn't get stuck
    console.error('Error classifying document:', err);
    try {
      await pool.query(
        "UPDATE documents SET classify_status = 'skipped' WHERE id = $1",
        [id],
      );
    } catch {
      // DB update also failed — just return error
    }
    res.status(500).json({ error: 'Failed to classify document' });
  }
});

export default router;
