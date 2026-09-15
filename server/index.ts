import express, { type Request, type Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_KEY, UPSTREAM } from './config.js';
import pool from './db.js';
import { GENERATION_TIMEOUT_MS } from './src/generationPipeline.js';
import { runMigrations } from './migrations/run.js';
import documentsRouter from './routes/documents.js';
import videoDocumentsRouter from './routes/videoDocuments.js';
import chaptersRouter from './routes/chapters.js';
import coursesRouter from './routes/courses.js';
import chatSessionsRouter from './routes/chatSessions.js';
import chapterAnalysisRouter from './routes/chapterAnalysis.js';
import chapterVideosRouter from './routes/chapterVideos.js';
import textbooksRouter from './routes/textbooks.js';
import studyGuidesRouter from './routes/studyGuides.js';
import flashcardsRouter from './routes/flashcards.js';
import practiceTestsRouter from './routes/practiceTests.js';
import courseraRouter from './routes/coursera.js';
import integrationsRouter from './routes/integrations.js';
import roadmapsRouter from './routes/roadmaps.js';
import learningRouter from './routes/learning.js';
import videosRouter from './routes/videos.js';

// ── Types ───────────────────────────────────────────────────────────────────
interface ChatMessage {
  role: string;
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  model?: string;
  tools?: unknown[];
}

interface ChatPayload {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  max_tokens: number;
  stream: boolean;
  tools?: unknown[];
}

const MODEL = 'glm-5.3-flash';
const PORT: number = process.env.PORT ? parseInt(process.env.PORT, 10) : 3002;

const app = express();

// ── CORS ────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
    // Allow any localhost / 127.0.0.1 / LAN / Tailscale origin, or no origin (curl)
    if (!origin) return cb(null, true);
    try {
      const url = new URL(origin);
      if (
        url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        // Allow private/LAN IPs
        /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.)/.test(url.hostname)
      ) {
        return cb(null, true);
      }
    } catch { /* invalid url */ }
    // Default: allow anyway (dev convenience)
    cb(null, true);
  },
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', model: MODEL });
});

// ── Document & Chapter CRUD ────────────────────────────────────────────────
app.use('/api/documents', documentsRouter);
app.use('/api', videoDocumentsRouter);
app.use('/api', chaptersRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/chat-sessions', chatSessionsRouter);
app.use('/api', chapterAnalysisRouter);
app.use('/api', chapterVideosRouter);
app.use('/api/textbooks', textbooksRouter);
app.use('/api/study-guides', studyGuidesRouter);
app.use('/api/flashcard-decks', flashcardsRouter);
app.use('/api/practice-tests', practiceTestsRouter);
app.use('/api/coursera', courseraRouter);
app.use('/api/integrations', integrationsRouter);
app.use('/api', roadmapsRouter);
app.use('/api', learningRouter);
app.use('/api', videosRouter);

// ── POST /api/chat ──────────────────────────────────────────────────────────
app.post('/api/chat', async (req: Request<Record<string, never>, unknown, ChatRequestBody>, res: Response) => {
  const { messages, temperature, max_tokens, stream, model, tools } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  const payload: ChatPayload = {
    model: model || MODEL,
    messages,
    temperature: temperature ?? 0.7,
    max_tokens: max_tokens ?? 4096,
    stream: !!stream,
  };

  if (Array.isArray(tools) && tools.length > 0) {
    payload.tools = tools;
  }

  try {
    const upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error(`Upstream error ${upstream.status}: ${errText.slice(0, 200)}`);
      return res.status(upstream.status).json({ error: `Upstream error: ${upstream.status}`, details: errText });
    }

    if (payload.stream) {
      // ── Streaming (SSE) ──────────────────────────────────────────────────
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('Stream read error:', errorMsg);
      } finally {
        res.end();
      }
    } else {
      // ── Non-streaming ────────────────────────────────────────────────────
      const data = await upstream.json();
      res.json(data);
    }
  } catch (err: unknown) {
    console.error('Proxy error:', err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Internal proxy error', message: errorMsg });
  }
});

// ── Background reaper (US-010) ──────────────────────────────────────────────
// Every 60s, mark rows that have been stuck in `generating` longer than the
// generation timeout as `error`. This catches generations wedged by a crashed
// worker, a dead client, or any other path that left the DB row dangling.
//
// The read-time staleness checks in the GET routes (US-007–US-009) remain as a
// fallback for clients that poll before the next reaper tick.
//
// Allow-listed table names (cannot be parameterised in SQL) — these match the
// `VALID_TABLES` set in generationPipeline.ts and the schema in schema.sql.
const REAPABLE_TABLES = ['study_guides', 'flashcard_decks', 'practice_tests', 'roadmaps'] as const;
const REAPER_INTERVAL_MS = 60_000;

async function reapStuckGenerations(): Promise<void> {
  for (const table of REAPABLE_TABLES) {
    try {
      const result = await pool.query(
        `UPDATE ${table}
         SET status = 'error', error = 'Generation timed out', updated_at = NOW()
         WHERE status = 'generating'
           AND updated_at < NOW() - ($1 || ' milliseconds')::interval
         RETURNING id`,
        [GENERATION_TIMEOUT_MS],
      );
      if (result.rows.length > 0) {
        const ids = result.rows.map((r: { id: string }) => r.id).join(', ');
        console.log(`[reaper] Marked ${result.rows.length} stuck ${table} as error: ${ids}`);
      }
    } catch (err) {
      // A transient DB error must not kill the interval.
      console.error(`[reaper] Failed to reap ${table}:`, err);
    }
  }
}

// ── SPA fallback (production) ────────────────────────────────────────────────
// Serve built frontend assets from dist/ and fall back to index.html for any
// non-API GET request so deep client-side routes (e.g. /documents/:id) survive
// a hard refresh. Registered AFTER all /api/* routes so it never shadows them.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');

app.use(express.static(distDir));

app.get(/^\/(?!api).*/, (_req: Request, res: Response) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

// ── Start ───────────────────────────────────────────────────────────────────
// Migrations run BEFORE app.listen() so routes never accept traffic against an
// out-of-date schema. If a migration fails the server refuses to start.
//
// To add a new migration: create server/migrations/NNN_description.sql
// (where NNN is the next number) and it will be applied automatically on next boot.
void runMigrations()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Inkwell AI backend running on http://localhost:${PORT}`);
      console.log(`   Model: ${MODEL}`);
      console.log(`   Health: http://localhost:${PORT}/api/health`);

      // Kick off the background reaper. `unref()` so it does not keep the event
      // loop (and therefore the process) alive on shutdown.
      const reaperInterval = setInterval(reapStuckGenerations, REAPER_INTERVAL_MS);
      reaperInterval.unref();
      console.log(`   Reaper: every ${REAPER_INTERVAL_MS / 1000}s (timeout ${GENERATION_TIMEOUT_MS}ms)`);
    });
  })
  .catch((err: unknown) => {
    console.error('[startup] Migration failed, refusing to start:', err);
    process.exit(1);
  });
