import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { randomBytes } from 'crypto';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pool from '../db.js';
import { API_KEY, UPSTREAM } from '../config.js';
import { type TextbookRow, rowToTextbook } from './textbooks.js';
import { storageUpload, storageDownload, storageDelete, isStorageKey } from '../src/storage.js';
import { callGLM, callGLMJson } from '../src/llm.js';
import { synthesizeDialogWithOffsets, type DialogLine } from '../src/tts.js';
import { uid } from '../src/auth.js';

const router = Router();

// ── Multer memory storage (files go to Supabase Storage) ───────────────────
const upload = multer({ storage: multer.memoryStorage() });

// ── Helper: snake_case → camelCase ──────────────────────────────────────────
export interface DocRow {
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
  summary: string | null;
  summary_status: string;
  summary_error: string | null;
  podcast_path: string | null;
  podcast_status: string;
  podcast_error: string | null;
  podcast_sections: unknown;
  needs_upgrade: boolean;
  folder_id: string | null;
  last_opened_at: string | null;
  textbook_id: string | null;
  start_page: number | null;
  end_page: number | null;
  chapter_index: number | null;
  chapter_title: string | null;
  created_at: string;
  updated_at: string;
}

export function rowToDoc(row: DocRow) {
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
    summary: row.summary,
    summaryStatus: row.summary_status,
    summaryError: row.summary_error,
    podcastStatus: row.podcast_status,
    podcastError: row.podcast_error,
    podcastSections: row.podcast_sections ?? null,
    needsUpgrade: row.needs_upgrade,
    folderId: row.folder_id,
    lastOpenedAt: row.last_opened_at,
    textbookId: row.textbook_id,
    startPage: row.start_page,
    endPage: row.end_page,
    chapterIndex: row.chapter_index,
    chapterTitle: row.chapter_title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Helper: extract text from a PDF buffer ────────────────────────────────
export async function extractTextFromPDF(data: Uint8Array): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  const texts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    texts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
  }
  return texts.join('\n').replace(/\0/g, '');
}

/** Download a document's PDF from Storage and extract its text. */
export async function extractTextFromStorage(filePath: string): Promise<string> {
  return extractTextFromPDF(new Uint8Array(await storageDownload(filePath)));
}

// ── POST / — Upload a document ─────────────────────────────────────────────
// Media extensions normalize to the canonical DocumentType values ('audio' /
// 'video' / 'image') so the frontend's type-keyed icon/preview logic works;
// everything else keeps its extension as the type (matches the youtube doc
// pattern). .webm is in both maps — resolved by the browser-reported mimetype.
const AUDIO_EXTS = new Set(['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'webm']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi']);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'heic']);

router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const id = uuidv4();
  const name = file.originalname;
  const ext = path.extname(name).slice(1).toLowerCase() || 'bin';
  // .webm is ambiguous — the reported mimetype decides; audio wins ties.
  const type = AUDIO_EXTS.has(ext) && ((file.mimetype || '').startsWith('audio/') || !VIDEO_EXTS.has(ext))
    ? 'audio'
    : VIDEO_EXTS.has(ext)
      ? 'video'
      : IMAGE_EXTS.has(ext) || (file.mimetype || '').startsWith('image/')
        ? 'image'
        : ext;
  const mimeType = file.mimetype;
  const size = file.size;
  const storagePath = `${id}_${name}`;
  // Optional destination folder (Drive-style upload-into-current-folder).
  const folderRaw = (req.body as Record<string, unknown> | undefined)?.folderId;
  const folderId = typeof folderRaw === 'string' && folderRaw.length > 0 ? folderRaw : null;

  try {
    if (folderId) {
      const { rowCount } = await pool.query('SELECT 1 FROM folders WHERE id = $1 AND user_id = $2', [folderId, uid(req)]);
      if (!rowCount) return res.status(400).json({ error: 'Destination folder not found' });
    }
    await storageUpload(storagePath, file.buffer, mimeType || 'application/octet-stream');
    await pool.query(
      `INSERT INTO documents (id, name, type, mime_type, size, file_path, user_id, folder_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, name, type, mimeType, size, storagePath, uid(req), folderId],
    );

    const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
    res.status(201).json(rowToDoc(rows[0] as DocRow));
  } catch (err: unknown) {
    console.error('Error inserting document:', err);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

// ── GET / — List all documents ─────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    // Exclude documents that belong to a textbook (they're fetched via /api/textbooks/:id)
    const { rows } = await pool.query('SELECT * FROM documents WHERE textbook_id IS NULL AND user_id = $1 ORDER BY created_at DESC', [uid(req)]);
    res.json((rows as DocRow[]).map(rowToDoc));
  } catch (err: unknown) {
    console.error('Error fetching documents:', err);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// ── GET /:id/download — Download raw PDF file ──────────────────────────────
router.get('/:id/download', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1 AND user_id = $2', [req.params.id, uid(req)]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const doc = rows[0] as DocRow;
    const filePath = doc.file_path;
    if (!filePath || !isStorageKey(filePath)) {
      return res.status(404).json({ error: 'File not found in storage' });
    }
    const buf = await storageDownload(filePath);
    res.setHeader('Content-Type', doc.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${doc.name}"`);
    res.setHeader('Content-Length', String(buf.length));
    res.end(buf);
  } catch (err: unknown) {
    console.error('Error downloading document file:', err);
    res.status(500).json({ error: 'Failed to download document file' });
  }
});

// ── GET /:id — Get single document ──────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1 AND user_id = $2', [req.params.id, uid(req)]);
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
  if (typeof req.body.folderId === 'string' || req.body.folderId === null) {
    sets.push(`folder_id = $${i++}`);
    values.push(req.body.folderId); // validated by the FK
  }

  if (sets.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  sets.push(`updated_at = now()`);
  values.push(req.params.id);
  values.push(uid(req));

  try {
    const { rows } = await pool.query(
      `UPDATE documents SET ${sets.join(', ')} WHERE id = $${i} AND user_id = $${i + 1} RETURNING *`,
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
    const { rows } = await pool.query('SELECT file_path, podcast_path FROM documents WHERE id = $1 AND user_id = $2', [req.params.id, uid(req)]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Remove chapter files from Storage (FK CASCADE deletes the rows)
    const { rows: chapterRows } = await pool.query(
      'SELECT file_path FROM chapters WHERE parent_id = $1',
      [req.params.id],
    );
    for (const row of chapterRows) {
      const chPath = (row as { file_path: string | null }).file_path;
      if (chPath) {
        try { await storageDelete(chPath); } catch { /* already deleted */ }
      }
    }

    await pool.query('DELETE FROM documents WHERE id = $1', [req.params.id]);

    // Remove file from Storage
    const filePath = (rows[0] as { file_path: string | null }).file_path;
    if (filePath && isStorageKey(filePath)) {
      try {
        await storageDelete(filePath);
      } catch {
        // File may already be deleted
      }
    }

    // Remove podcast audio from Storage
    const podcastPath = (rows[0] as { podcast_path: string | null }).podcast_path;
    if (podcastPath) {
      try { await storageDelete(podcastPath); } catch { /* already deleted */ }
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
  const id = String(req.params.id);

  try {
    // 1. Fetch document from DB
    const { rows } = await pool.query('SELECT parsed_text FROM documents WHERE id = $1 AND user_id = $2', [id, uid(req)]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const parsedText = (rows[0] as { parsed_text: string | null }).parsed_text;

    // 2. If parsed_text is empty/missing, skip. Media uploads (audio/video
    //    without transcripts) land here — settle the downstream statuses too
    //    so the UI doesn't poll a chain that will never run.
    if (!parsedText || parsedText.trim().length === 0) {
      await pool.query(
        `UPDATE documents SET
           classify_status = 'skipped',
           summary_status = CASE WHEN summary_status = 'pending' THEN 'skipped' ELSE summary_status END,
           podcast_status = CASE WHEN podcast_status = 'pending' THEN 'skipped' ELSE podcast_status END
         WHERE id = $1`,
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
        model: 'glm-5.3-flash',
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
        // Fetch current name to preserve extension.
        // NOTE: the Storage object key ({id}_{originalName}) is NOT renamed —
        // object keys are opaque; the DB `name` drives all user-facing names.
        const { rows: nameRows } = await pool.query('SELECT name FROM documents WHERE id = $1', [id]);
        const oldName = (nameRows[0] as { name: string }).name;
        const ext = path.extname(oldName);
        const newName = title + ext;

        sets.push(`name = $${nextIdx++}`);
        values.push(newName);
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

    // 12. Return result. Chain the auto-summary after classification so the
    // two LLM calls never run concurrently (guards against rate limits).
    triggerAutoSummary(id);
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

// ── Auto-summary ─────────────────────────────────────────────────────────────
// One summary per document (TL;DR + key points as markdown), auto-generated
// server-side when the document is added. The button on the Summary tab is
// redundant — this runs on upload / URL import.

const SUMMARY_SYSTEM_PROMPT = `You are an expert study assistant. Summarize study material for a student. Respond with markdown in exactly two sections:

## TL;DR
2-3 sentences capturing what this material is about.

## Key Points
A bulleted list of the most important concepts, definitions, and takeaways.`;

/** Generate the document summary via GLM and persist it. Returns the markdown. */
async function generateDocumentSummary(id: string, parsedText: string): Promise<string> {
  // Truncate very large documents to keep the prompt bounded.
  const excerpt = parsedText.length > 60000 ? parsedText.slice(0, 60000) : parsedText;
  const markdown = await callGLM(
    [
      { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
      { role: 'user', content: `Summarize the following material:\n\n${excerpt}` },
    ],
    { temperature: 0.3, maxTokens: 2048 },
  );

  const text = markdown.trim();
  if (!text) throw new Error('Summary generation returned empty content');

  await pool.query(
    'UPDATE documents SET summary = $1, summary_status = $2, summary_error = NULL, updated_at = now() WHERE id = $3',
    [text, 'done', id],
  );
  return text;
}

/** Set summary_status = 'failed' + persist the reason (failures are data). */
async function markSummaryFailed(id: string, errMsg?: string): Promise<void> {
  try {
    await pool.query(
      "UPDATE documents SET summary_status = 'failed', summary_error = $2, updated_at = now() WHERE id = $1",
      [id, errMsg ? errMsg.slice(0, 500) : null],
    );
  } catch {
    // ignore — status update is best effort
  }
}

/**
 * Fire-and-forget auto-summary for a document. Intended to be chained after
 * classification completes so the LLM calls don't run concurrently (rate
 * limits + the doc's parsed_text is already committed by then).
 */
export function triggerAutoSummary(id: string): void {
  void (async () => {
    try {
      const { rows } = await pool.query(
        "SELECT parsed_text FROM documents WHERE id = $1 AND summary_status IN ('pending', 'failed', 'generating')",
        [id],
      );
      if (rows.length === 0) return; // already done/generating, or doc gone
      const parsedText = (rows[0] as { parsed_text: string | null }).parsed_text;
      if (!parsedText || parsedText.trim().length === 0) {
        await pool.query(
          "UPDATE documents SET summary_status = 'skipped', updated_at = now() WHERE id = $1",
          [id],
        );
        return;
      }
      await pool.query(
        "UPDATE documents SET summary_status = 'generating', updated_at = now() WHERE id = $1",
        [id],
      );
      await generateDocumentSummary(id, parsedText);
      triggerAutoPodcast(id); // chain: summary done → podcast
    } catch (err: unknown) {
      console.error('Auto-summary failed:', err);
      await markSummaryFailed(id, err instanceof Error ? err.message : String(err));
    }
  })();
}

// ── POST /:id/summary — (Re)generate the document summary ───────────────────
// Normally triggered automatically after classification; exposed so failures
// can be retried.
router.post('/:id/summary', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const { rows } = await pool.query('SELECT parsed_text FROM documents WHERE id = $1 AND user_id = $2', [id, uid(req)]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const parsedText = (rows[0] as { parsed_text: string | null }).parsed_text;
    if (!parsedText || parsedText.trim().length === 0) {
      await pool.query(
        "UPDATE documents SET summary_status = 'skipped', updated_at = now() WHERE id = $1",
        [id],
      );
      return res.status(400).json({ error: 'Document has no parseable text' });
    }

    await pool.query(
      "UPDATE documents SET summary_status = 'generating', updated_at = now() WHERE id = $1",
      [id],
    );
    const summary = await generateDocumentSummary(id, parsedText);
    triggerAutoPodcast(id); // chain: summary done → podcast
    res.json({ summary, status: 'done' });
  } catch (err: unknown) {
    console.error('Error generating summary:', err);
    await markSummaryFailed(id, err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

// ── Auto-podcast (Turbo-style audio overview) ────────────────────────────────
// After the summary is done: GLM writes a two-speaker dialogue script, edge-tts
// renders it two-voice, the MP3 lands in Storage. No user-facing types — one
// ~5-minute podcast per document.

const PODCAST_SYSTEM_PROMPT = `You write podcast scripts. Turn the study material below into an engaging two-speaker dialogue: a friendly HOST and an expert GUEST. Keep the GUEST's explanations grounded in the material — no invented facts.

Respond with ONLY JSON (no markdown fences, no commentary):
{"title": "short episode title", "sections": [{"title": "section name", "lines": [{"speaker": "host", "text": "..."}, {"speaker": "guest", "text": "..."}]}]}

Rules: 3-6 sections covering the material in order; 2-4 line exchanges per section (8-16 lines total); each text is 1-4 sentences of plain spoken prose — no speaker names inside text, no stage directions, no markdown, no lists.`;

interface PodcastSection {
  title: string;
  lines: DialogLine[];
  startS?: number;
}

/** GLM writes a sectioned dialogue script; falls back to one flat section. */
async function generatePodcastScriptV2(id: string): Promise<{ title: string; sections: PodcastSection[] }> {
  const { rows } = await pool.query('SELECT summary, parsed_text FROM documents WHERE id = $1', [id]);
  const doc = rows[0] as { summary: string | null; parsed_text: string | null };
  const excerpt = (doc.parsed_text || '').slice(0, 12000);

  let parsed: { title?: string; sections?: Array<{ title?: string; lines?: DialogLine[] }> } | null = null;
  try {
    parsed = await callGLMJson<{ title?: string; sections?: Array<{ title?: string; lines?: DialogLine[] }> }>(
      [
        { role: 'system', content: PODCAST_SYSTEM_PROMPT },
        { role: 'user', content: `Summary:\n${doc.summary || ''}\n\nSource material:\n${excerpt}` },
      ],
      { temperature: 0.7, maxTokens: 4096 },
    );
  } catch (err) {
    console.error('Podcast v2 script generation failed, falling back to v1:', err);
  }

  const sections: PodcastSection[] = (parsed?.sections || [])
    .filter((s) => s && Array.isArray(s.lines))
    .map((s) => ({
      title: (s.title || 'Discussion').trim().slice(0, 80),
      lines: s.lines!.filter((l) => l && typeof l.text === 'string' && l.text.trim() && (l.speaker === 'host' || l.speaker === 'guest')),
    }))
    .filter((s) => s.lines.length >= 2);

  if (sections.length === 0) {
    // Legacy flat-array response (or malformed) — one section keeps v2 usable.
    const flat = await generatePodcastScript(id);
    return { title: 'Audio overview', sections: [{ title: 'Discussion', lines: flat, startS: 0 }] };
  }
  return { title: (parsed?.title || 'Audio overview').trim().slice(0, 80), sections };
}

/** GLM writes the dialogue script from the summary + source excerpt. */
async function generatePodcastScript(id: string): Promise<DialogLine[]> {
  const { rows } = await pool.query('SELECT summary, parsed_text FROM documents WHERE id = $1', [id]);
  const doc = rows[0] as { summary: string | null; parsed_text: string | null };
  const excerpt = (doc.parsed_text || '').slice(0, 12000);
  const lines = await callGLMJson<DialogLine[]>(
    [
      { role: 'system', content: PODCAST_SYSTEM_PROMPT },
      { role: 'user', content: `Summary:\n${doc.summary || ''}\n\nSource material:\n${excerpt}` },
    ],
    { temperature: 0.7, maxTokens: 4096 },
  );
  if (!lines || !Array.isArray(lines)) throw new Error('Podcast script generation returned no JSON');
  const clean = lines
    .filter((l) => l && typeof l.text === 'string' && l.text.trim() && (l.speaker === 'host' || l.speaker === 'guest'))
    .map((l) => ({ speaker: l.speaker, text: l.text.trim() }));
  if (clean.length < 2) throw new Error(`Podcast script too short (${clean.length} lines)`);
  return clean;
}

/** Set podcast_status = 'failed' + persist the reason (failures are data). */
async function markPodcastFailed(id: string, errMsg?: string): Promise<void> {
  try {
    await pool.query(
      "UPDATE documents SET podcast_status = 'failed', podcast_error = $2, updated_at = now() WHERE id = $1",
      [id, errMsg ? errMsg.slice(0, 500) : null],
    );
  } catch {
    // ignore — status update is best effort
  }
}

/** Synthesize the script and persist audio + section JSONB. Shared by auto + manual paths. */
async function synthesizeAndStorePodcast(id: string, script: { title: string; sections: PodcastSection[] }): Promise<void> {
  const flat = script.sections.flatMap((s) => s.lines);
  const { audio: mp3, segments } = await synthesizeDialogWithOffsets(flat);
  // Map per-line offsets back onto sections; round to whole seconds.
  let li = 0;
  const withStarts = script.sections.map((s) => {
    const startS = Math.round(segments[li].startS);
    const lines = s.lines.map((l, i) => ({ ...l, startS: Math.round(segments[li + i].startS) }));
    li += s.lines.length;
    return { title: s.title, startS, lines };
  });
  const last = segments[segments.length - 1];
  const podcastJson = {
    title: script.title,
    durationS: Math.round(last.startS + last.durationS),
    sections: withStarts.map((s, i) => ({
      title: s.title,
      startS: s.startS,
      durationS: i + 1 < withStarts.length ? withStarts[i + 1].startS - s.startS : undefined,
      lines: s.lines,
    })),
  };
  const storagePath = `podcasts/${id}.mp3`;
  await storageUpload(storagePath, mp3, 'audio/mpeg');
  await pool.query(
    "UPDATE documents SET podcast_path = $1, podcast_sections = $2, podcast_status = 'done', updated_at = now() WHERE id = $3",
    [storagePath, JSON.stringify(podcastJson), id],
  );
}

/**
 * Fire-and-forget auto-podcast, chained after summary completes so the
 * GLM call doesn't run concurrently with summary/classify (rate limits).
 */
export function triggerAutoPodcast(id: string): void {
  void (async () => {
    try {
      const { rows } = await pool.query(
        "SELECT summary FROM documents WHERE id = $1 AND podcast_status IN ('pending', 'failed', 'generating')",
        [id],
      );
      if (rows.length === 0) return; // already done/generating, or doc gone
      const summary = (rows[0] as { summary: string | null }).summary;
      if (!summary || summary.trim().length === 0) {
        // No summary to talk about — the chained flow never reaches here
        // (we're called after summary is done), but a manual retry might.
        await pool.query(
          "UPDATE documents SET podcast_status = 'skipped', updated_at = now() WHERE id = $1",
          [id],
        );
        return;
      }
      await pool.query(
        "UPDATE documents SET podcast_status = 'generating', updated_at = now() WHERE id = $1",
        [id],
      );
      const script = await generatePodcastScriptV2(id);
      await synthesizeAndStorePodcast(id, script);
    } catch (err: unknown) {
      console.error('Auto-podcast failed:', err);
      await markPodcastFailed(id, err instanceof Error ? err.message : String(err));
    }
  })();
}

// ── POST /:id/podcast — (Re)generate the podcast ─────────────────────────────
// Normally triggered automatically after the summary; exposed so failures can
// be retried. Resolves when the audio is in Storage.
router.post('/:id/podcast', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const { rows } = await pool.query('SELECT summary FROM documents WHERE id = $1 AND user_id = $2', [id, uid(req)]);
    if (rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    if (!(rows[0] as { summary: string | null }).summary) {
      return res.status(400).json({ error: 'Document has no summary yet — generate the summary first' });
    }
    await pool.query(
      "UPDATE documents SET podcast_status = 'generating', updated_at = now() WHERE id = $1",
      [id],
    );
    const script = await generatePodcastScriptV2(id);
    await synthesizeAndStorePodcast(id, script);
    res.json({ status: 'done' });
  } catch (err: unknown) {
    console.error('Error generating podcast:', err);
    await markPodcastFailed(id, err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'Failed to generate podcast' });
  }
});

// ── GET /:id/podcast — Stream the podcast MP3 ────────────────────────────────
router.get('/:id/podcast', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT podcast_path FROM documents WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    const path = (rows[0] as { podcast_path: string | null }).podcast_path;
    if (!path) return res.status(404).json({ error: 'No podcast generated yet' });
    const buf = await storageDownload(path);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Accept-Ranges', 'none'); // ponytail: no range requests, add if seeking matters
    res.end(buf);
  } catch (err: unknown) {
    console.error('Error streaming podcast:', err);
    res.status(500).json({ error: 'Failed to stream podcast' });
  }
});

// ── POST /:id/opened — mark last-opened (E1 "Jump back in" recency) ─────────
router.post('/:id/opened', async (req: Request, res: Response) => {
  await pool.query(
    'UPDATE documents SET last_opened_at = now() WHERE id = $1 AND user_id = $2',
    [String(req.params.id), uid(req)],
  );
  res.json({ ok: true });
});

// ── POST /:id/share — create (or return existing) public share link ─────────
router.post('/:id/share', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { rows } = await pool.query('SELECT id FROM documents WHERE id = $1 AND user_id = $2', [id, uid(req)]);
  if (rows.length === 0) return res.status(404).json({ error: 'Document not found' });

  const existing = await pool.query('SELECT token FROM document_shares WHERE document_id = $1', [id]);
  if (existing.rows.length > 0) return res.json({ token: (existing.rows[0] as { token: string }).token });

  const token = randomBytes(16).toString('base64url');
  await pool.query('INSERT INTO document_shares (token, document_id) VALUES ($1, $2)', [token, id]);
  res.status(201).json({ token });
});

// ── POST /:id/convert-to-textbook ──────────────────────────────────────────
// Converts a document + its saved chapters into a textbook with individual
// chapter documents. Deletes the original document and its chapter records.
router.post('/:id/convert-to-textbook', async (req: Request, res: Response) => {
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

      // Extract text from chapter PDF if it exists in Storage
      let parsedText = chRow.parsed_text || '';
      let fileSize = 0;
      const chapterFilePath = chRow.file_path;

      if (chapterFilePath && isStorageKey(chapterFilePath)) {
        try {
          const buf = await storageDownload(chapterFilePath);
          fileSize = buf.length;
          parsedText = await extractTextFromPDF(new Uint8Array(buf));
        } catch (err) {
          console.error(`Failed to extract text from chapter ${chRow.chapter_title}:`, err);
        }
      }

      // Insert as a new document, reusing the chapter's file path
      const { rows: newDocRows } = await pool.query(
        `INSERT INTO documents (id, name, type, mime_type, size, parsed_text, tags, file_path, textbook_id, start_page, end_page, chapter_index, chapter_title)
         VALUES ($1, $2, 'pdf', 'application/pdf', $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          docId,
          chapterName,
          fileSize,
          parsedText,
          chRow.tags ?? JSON.stringify(parentDoc.tags ?? []),
          chapterFilePath, // reuse the existing file (don't copy)
          textbookId,
          chRow.start_page,
          chRow.end_page,
          chRow.chapter_index,
          chRow.chapter_title,
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
    if (parentFilePath && isStorageKey(parentFilePath)) {
      try { await storageDelete(parentFilePath); } catch { /* already deleted */ }
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

export default router;
