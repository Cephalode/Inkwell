import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'path';
import { unlinkSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { renameSync } from 'fs';
import pool from '../db.js';

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
  tags: unknown;
  file_path: string | null;
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
    tags: row.tags,
    filePath: row.file_path,
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

// ── PATCH /:id — Update tags ───────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response) => {
  const { tags } = req.body;
  if (!Array.isArray(tags)) {
    return res.status(400).json({ error: 'tags must be an array' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE documents SET tags = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [JSON.stringify(tags), req.params.id],
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

export default router;
