import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { API_KEY, UPSTREAM } from './config.js';
import documentsRouter from './routes/documents.js';
import videoDocumentsRouter from './routes/videoDocuments.js';
import chaptersRouter from './routes/chapters.js';
import coursesRouter from './routes/courses.js';
import chatSessionsRouter from './routes/chatSessions.js';
import chapterAnalysisRouter from './routes/chapterAnalysis.js';
import textbooksRouter from './routes/textbooks.js';
import studyGuidesRouter from './routes/studyGuides.js';
import flashcardsRouter from './routes/flashcards.js';
import practiceTestsRouter from './routes/practiceTests.js';

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

const MODEL = 'glm-5.1';
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
app.use('/api/textbooks', textbooksRouter);
app.use('/api/study-guides', studyGuidesRouter);
app.use('/api/flashcard-decks', flashcardsRouter);
app.use('/api/practice-tests', practiceTestsRouter);

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

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Inkwell AI backend running on http://localhost:${PORT}`);
  console.log(`   Model: ${MODEL}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
});
