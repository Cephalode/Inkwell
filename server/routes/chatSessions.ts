import { Router, type Request, type Response } from 'express';
import pool from '../db.js';
import { API_KEY, UPSTREAM } from '../config.js';

const router = Router();

interface SessionRow {
  id: string;
  document_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  citations: unknown;
  created_at: string;
}

function rowToSession(row: SessionRow, messages: any[] = []) {
  return {
    id: row.id,
    documentId: row.document_id ?? undefined,
    title: row.title,
    messages,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: MessageRow) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    citations: row.citations ?? undefined,
    timestamp: row.created_at,
  };
}

// GET / — list sessions without messages (lightweight)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, document_id, title, created_at, updated_at FROM chat_sessions ORDER BY updated_at DESC'
    );
    res.json(rows.map((r: SessionRow) => rowToSession(r)));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /:id — session with messages
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows: sessionRows } = await pool.query('SELECT * FROM chat_sessions WHERE id = $1', [req.params.id]);
    if (sessionRows.length === 0) return res.status(404).json({ error: 'Session not found' });
    const { rows: msgRows } = await pool.query(
      'SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(rowToSession(sessionRows[0] as SessionRow, msgRows.map((r: MessageRow) => rowToMessage(r))));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /
router.post('/', async (req: Request, res: Response) => {
  try {
    const { id, title = '', document_id = null } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO chat_sessions (id, title, document_id) VALUES ($1, $2, $3) RETURNING *',
      [id, title, document_id]
    );
    res.status(201).json(rowToSession(rows[0] as SessionRow));
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
      const snake = key === 'documentId' ? 'document_id' : key;
      fields.push(`${snake} = $${i}`);
      values.push(val);
      i++;
    }
    fields.push('updated_at = now()');
    values.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE chat_sessions SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    res.json(rowToSession(rows[0] as SessionRow));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM chat_sessions WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /:id/messages
router.post('/:id/messages', async (req: Request, res: Response) => {
  try {
    const { id, role, content, citations = null } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO chat_messages (id, session_id, role, content, citations) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, req.params.id, role, content, citations !== null ? JSON.stringify(citations) : null]
    );
    await pool.query('UPDATE chat_sessions SET updated_at = now() WHERE id = $1', [req.params.id]);
    res.status(201).json(rowToMessage(rows[0] as MessageRow));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /:id/generate-title
router.post('/:id/generate-title', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    const resp = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: 'glm-5.1',
        messages: [
          { role: 'system', content: 'You are a title generator. Given the first message of a chat conversation, generate a concise title (3-6 words) that captures the main topic. Reply with ONLY the title text, nothing else. No quotes, no prefixes.' },
          { role: 'user', content: message },
        ],
        temperature: 0.3,
        max_tokens: 500,
        stream: false,
      }),
    });
    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim();
    const title = content && content.length > 0 ? content : null;
    if (!title) return res.status(500).json({ error: 'Failed to generate title' });
    await pool.query('UPDATE chat_sessions SET title = $1, updated_at = now() WHERE id = $2', [title, req.params.id]);
    res.json({ title });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
