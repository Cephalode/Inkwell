import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db.js';
import { canFetchTranscript, fetchYouTubeTranscript } from '../src/transcriptFetcher.js';
import { rowToDoc, type DocRow } from './documents.js';
import { uid } from '../src/auth.js';
import { parseJSON } from '../src/subsectionDetector.js';
import { callGLM } from '../src/llm.js';
import { send, setSSEHeaders } from '../src/sse.js';

const router = Router();

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3002;

// ── Types ───────────────────────────────────────────────────────────────────

export interface VideoSummary {
  summary: string;
  keyPoints: string[];
  formulas: string[];
  definitions: string[];
  topics: string[];
}

// ── POST /documents/from-url ────────────────────────────────────────────────
// Accepts { url, folderId? } in JSON. YouTube URLs get the full treatment:
// transcript fetch → document → background classification. Any other link is
// saved as a lightweight 'link' document (URL + page title, no transcript).
router.post('/documents/from-url', async (req: Request, res: Response) => {
  const { url, folderId } = req.body as { url?: string; folderId?: string };

  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    return res.status(400).json({ error: 'url is required' });
  }

  // Optional destination folder (Drive-style upload-into-current-folder).
  let destFolderId: string | null = null;
  if (folderId && typeof folderId === 'string') {
    const { rowCount } = await pool.query('SELECT 1 FROM folders WHERE id = $1 AND user_id = $2', [folderId, uid(req)]);
    if (!rowCount) return res.status(400).json({ error: 'Destination folder not found' });
    destFolderId = folderId;
  }

  if (canFetchTranscript(url)) {
    try {
      // 1. Fetch transcript.
      const { transcript, title } = await fetchYouTubeTranscript(url);

      // 2. Create document in DB.
      const id = uuidv4();
      await pool.query(
        `INSERT INTO documents (id, name, type, mime_type, size, parsed_text, file_path, folder_id, classify_status)
         VALUES ($1, $2, 'youtube', 'text/plain', 0, $3, $4, $5, 'classifying')`,
        [id, title, transcript, url, destFolderId],
      );

      const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
      const doc = rowToDoc(rows[0] as DocRow);

      // 3. Trigger classification in the background (reuses existing flow).
      void fetch(`http://localhost:${PORT}/api/documents/${id}/classify`, {
        method: 'POST',
      }).catch((err: unknown) => {
        console.error('Background classify failed:', err);
      });

      return res.status(201).json(doc);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Error creating document from URL:', message);
      return res.status(500).json({ error: 'Failed to create document from URL', message });
    }
  }

  // ── General link: no transcript, just a bookmark-style document ────────────
  let hostname = url;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
    hostname = parsed.hostname.replace(/^www\./, '');
  } catch {
    return res.status(400).json({ error: 'Please enter a valid URL' });
  }
  // Best-effort page <title> fetch (3s cap — a slow link must not block the save).
  let title = hostname;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const page = await fetch(parsed_href(url), { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);
    const html = (await page.text()).slice(0, 50000);
    title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || hostname;
  } catch {
    /* offline link or slow site — hostname is the name */
  }
  const id = uuidv4();
  await pool.query(
    `INSERT INTO documents (id, name, type, mime_type, size, parsed_text, file_path, folder_id, classify_status)
     VALUES ($1, $2, 'link', 'text/plain', 0, $3, $4, $5, 'skipped')`,
    [id, title.slice(0, 200), `Link: ${url}`, url, destFolderId],
  );
  const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
  res.status(201).json(rowToDoc(rows[0] as DocRow));
});

// Accept bare hostnames ("example.com") as well as full URLs.
function parsed_href(url: string): string {
  return url.startsWith('http') ? url : `https://${url}`;
}

// ── GET /documents/:id/video-summary ────────────────────────────────────────
// SSE endpoint: streams an AI analysis of the stored transcript and persists it.
router.get('/documents/:id/video-summary', async (req: Request, res: Response) => {
  setSSEHeaders(res);

  let closed = false;
  req.on('close', () => {
    closed = true;
  });

  const fail = (message: string) => {
    if (!closed) send(res, { type: 'error', message });
    res.end();
  };

  try {
    const { id } = req.params;

    const { rows } = await pool.query('SELECT parsed_text FROM documents WHERE id = $1', [id]);
    if (rows.length === 0) return fail('Document not found');
    const parsedText = (rows[0] as { parsed_text: string | null }).parsed_text;
    if (!parsedText || parsedText.trim().length === 0) {
      return fail('No transcript text available for this document');
    }

    send(res, { type: 'analyzing' });

    // Truncate very long transcripts to stay within context limits.
    const safeText =
      parsedText.length > 12000 ? parsedText.slice(0, 12000) + '\n…[truncated]' : parsedText;

    const raw = await callGLM(
      [
        {
          role: 'system',
          content: 'You are an expert academic assistant analyzing a video transcript.',
        },
        {
          role: 'user',
          content: `Analyze this video transcript and provide a JSON response with:
- summary: 3-5 sentence overview
- keyPoints: array of the most important takeaways
- formulas: array of any formulas or equations mentioned (as text), empty if none
- definitions: array of key terms and their definitions
- topics: array of main topics covered

Respond with ONLY a JSON object, no markdown fences.

Transcript:
${safeText}`,
        },
      ],
      { temperature: 0.3 },
    );

    const parsed = parseJSON<Partial<VideoSummary>>(raw) ?? {};

    // The model often returns definitions (and sometimes keyPoints) as objects
    // like { term, definition } rather than plain strings. Coerce any object
    // entry into a readable "term: definition" string; keep strings as-is.
    const toEntry = (v: unknown): string => {
      if (v == null) return '';
      if (typeof v === 'string') return v;
      if (typeof v === 'number') return String(v);
      if (typeof v === 'object') {
        const obj = v as Record<string, unknown>;
        // Common shapes: { term, definition } | { word, meaning } | { name, desc }
        const term = String(
          obj.term ?? obj.word ?? obj.name ?? obj.title ?? obj.key ?? '',
        ).trim();
        const def = String(
          obj.definition ?? obj.meaning ?? obj.desc ?? obj.description ?? obj.value ?? '',
        ).trim();
        if (term && def) return `${term}: ${def}`;
        if (term) return term;
        if (def) return def;
        // Fallback: join any string values the object has.
        const vals = Object.values(obj).filter((x) => typeof x === 'string');
        return vals.join(': ');
      }
      return String(v);
    };

    const result: VideoSummary = {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map(toEntry).filter(Boolean) : [],
      formulas: Array.isArray(parsed.formulas) ? parsed.formulas.map(toEntry).filter(Boolean) : [],
      definitions: Array.isArray(parsed.definitions) ? parsed.definitions.map(toEntry).filter(Boolean) : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics.map(toEntry).filter(Boolean) : [],
    };

    // Persist summary to DB.
    await pool.query(
      'UPDATE documents SET video_summary = $1::jsonb, updated_at = now() WHERE id = $2',
      [JSON.stringify(result), id],
    );

    send(res, { type: 'result', ...result });
    send(res, { type: 'done' });
    res.end();
  } catch (err: unknown) {
    console.error('Video summary error:', err);
    const message = err instanceof Error ? err.message : String(err);
    fail(message);
  }
});

export default router;
