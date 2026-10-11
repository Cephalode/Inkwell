// MCP endpoint: exposes Inkwell as tools over Streamable HTTP (stateless mode),
// mounted at POST /mcp. Auth reuses the browser session token (random 32B,
// stored hashed) passed as `Authorization: Bearer <token>` — no new token type.
// Reads hit the DB directly (documents.parsed_text is huge — don't ship it
// through JSON reserialisation); writes go through the same queries the REST
// routes use. No migrations, no frontend changes.
import { Router, type Request, type Response, type NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import pool from './db.js';
import { AUTH_ENABLED, userForToken, type User } from './src/auth.js';
import { storageUpload, storageDelete, isStorageKey } from './src/storage.js';
import { mimeForExt, typeForExt } from './routes/zipExtract.js';
import { loadRoadmapView } from './routes/roadmaps.js';
import { skillSlug } from './src/mastery.js';
import {
  buildDiagram,
  buildFlashcards,
  buildLesson,
  buildPodcast,
  buildQuiz,
  buildRecall,
  buildSlides,
  openDiscussion,
  groundingText,
  synthesizePodcastAudio,
  type LessonContent,
  type PodcastContent,
  type StepContext,
} from './src/tutor.js';
import { COVERAGE_FLOOR, rankVideos, searchVideosForSkill, SEARCH_TTL_MS, type RankedVideo } from './src/videoSearch.js';

// ── Auth ────────────────────────────────────────────────────────────────────
async function userForRequestToken(req: Request) {
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const query = typeof req.query.token === 'string' ? req.query.token : '';
  const token = bearer || query;
  if (!token) return null;
  try { return await userForToken(token); } catch { return null; }
}

// Same gate as requireUser, but token comes from the header instead of the cookie.
// The user rides in req.auth, which the transport forwards to handlers as extra.authInfo.
async function mcpAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!AUTH_ENABLED) return next(); // dev without OAuth creds — matches /api behavior
  const user = await userForRequestToken(req);
  if (!user) {
    res.status(401).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Unauthorized: pass your Inkwell session token as Authorization: Bearer <token>' }, id: null });
    return;
  }
  (req as Request & { auth?: unknown }).auth = { user };
  next();
}

// Per-call tenant key from the auth the transport forwarded.
const uidOf = (extra: { authInfo?: unknown }): string =>
  (extra.authInfo as { user?: User } | undefined)?.user?.id || 'shared';

// ── Server + tools ──────────────────────────────────────────────────────────
const mcp = new McpServer({ name: 'inkwell', version: '1.0.0' });

const TRUNC = 2000;
const clip = (s: unknown, n = TRUNC): string => {
  const t = String(s ?? '');
  return t.length > n ? `${t.slice(0, n)}… [${t.length - n} more chars]` : t;
};

// list_documents — id/name/type for every non-textbook document
mcp.tool(
  'list_documents',
  'List documents in the Inkwell library (id, name, type, size, created). No content.',
  {},
  async (_args, extra) => {
    const { rows } = await pool.query(
      `SELECT id, name, type, size, created_at FROM documents
        WHERE user_id = $1 AND textbook_id IS NULL ORDER BY created_at DESC LIMIT 100`,
      [uidOf(extra)],
    );
    return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
  },
);

// read_document — most relevant slice of parsed_text
mcp.tool(
  'read_document',
  'Read part of a document\'s extracted text. Omit query for the start; query finds the most relevant section.',
  { document_id: z.string().describe('Document id from list_documents'), query: z.string().optional().describe('Find the most relevant section instead of the start'), max_chars: z.number().int().min(500).max(8000).default(4000) },
  async ({ document_id, query, max_chars }, extra) => {
    const { rows } = await pool.query(
      `SELECT name, parsed_text FROM documents WHERE id = $1 AND user_id = $2`,
      [document_id, uidOf(extra)],
    );
    if (!rows.length) return { content: [{ type: 'text', text: 'Document not found.' }] };
    const text: string = rows[0].parsed_text || '';
    let slice = text.slice(0, max_chars);
    let where = 'start';
    if (query) {
      const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      let best = -1, bestScore = 0;
      for (let i = 0; i < words.length; i++) {
        const pos = text.toLowerCase().indexOf(words[i]);
        if (pos >= 0) {
          const score = words.filter((w) => text.toLowerCase().slice(Math.max(0, pos - 500), pos + 1000).includes(w)).length;
          if (score > bestScore) { bestScore = score; best = pos; }
        }
      }
      if (best >= 0) {
        const start = Math.max(0, best - 800);
        slice = text.slice(start, start + max_chars);
        where = `char ${start} (keyword match)`;
      } else {
        slice = text.slice(0, max_chars);
        where = 'start (no keyword match)';
      }
    }
    return { content: [{ type: 'text', text: `# ${rows[0].name}\n(excerpt from ${where} of ${text.length} chars)\n\n${clip(slice, max_chars)}` }] };
  },
);

// list_flashcard_decks
mcp.tool(
  'list_flashcard_decks',
  'List flashcard decks with card counts.',
  {},
  async (_args, extra) => {
    const { rows } = await pool.query(
      `SELECT d.id, d.title, d.description, count(c.id)::int AS cards
         FROM flashcard_decks d LEFT JOIN flashcards c ON c.deck_id = d.id
        WHERE d.user_id = $1 GROUP BY d.id ORDER BY d.created_at DESC LIMIT 50`,
      [uidOf(extra)],
    );
    return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
  },
);

// get_flashcards
mcp.tool(
  'get_flashcards',
  'Get all cards in a flashcard deck.',
  { deck_id: z.string().describe('Deck id from list_flashcard_decks') },
  async ({ deck_id }, extra) => {
    const deck = await pool.query('SELECT id, title FROM flashcard_decks WHERE id = $1 AND user_id = $2', [deck_id, uidOf(extra)]);
    if (!deck.rows.length) return { content: [{ type: 'text', text: 'Deck not found.' }] };
    const { rows } = await pool.query(
      'SELECT id, front, back, position, review_stats FROM flashcards WHERE deck_id = $1 ORDER BY position ASC',
      [deck_id],
    );
    return { content: [{ type: 'text', text: `# ${deck.rows[0].title}\n\n${JSON.stringify(rows, null, 2)}` }] };
  },
);

// get_roadmap
mcp.tool(
  'get_roadmap',
  'Get a course\'s active roadmap: steps with status and the next step.',
  { course_id: z.string().describe('Course id') },
  async ({ course_id }, extra) => {
    const { rows } = await pool.query(
      'SELECT * FROM roadmaps WHERE course_id = $1 AND user_id = $2 AND is_active ORDER BY created_at DESC LIMIT 1',
      [course_id, uidOf(extra)],
    );
    if (!rows.length) return { content: [{ type: 'text', text: 'No active roadmap for this course.' }] };
    const view = await loadRoadmapView(rows[0]);
    return { content: [{ type: 'text', text: JSON.stringify({ title: view.title, nextStepId: view.nextStepId, counts: view.counts, steps: view.steps }, null, 2) }] };
  },
);

// get_learning_overview — same shape as GET /api/learning/overview
mcp.tool(
  'get_learning_overview',
  'Learning dashboard: courses, roadmap progress, next steps, and skill mastery counts.',
  {},
  async (_args, extra) => {
    const { rows: courseRows } = await pool.query(
      `SELECT c.id, c.name, c.is_current, r.id AS roadmap_id, r.status
         FROM courses c LEFT JOIN roadmaps r ON r.course_id = c.id AND r.is_active
        WHERE c.user_id = $1
        ORDER BY c.is_current DESC, c.updated_at DESC`,
      [uidOf(extra)],
    );
    const courses = [];
    for (const c of courseRows) {
      if (!c.roadmap_id) {
        courses.push({ courseId: c.id, courseName: c.name, isCurrent: !!c.is_current, roadmapId: null, total: 0, learned: 0, learning: 0, nextStep: null });
        continue;
      }
      const { rows: rm } = await pool.query('SELECT * FROM roadmaps WHERE id = $1', [c.roadmap_id]);
      const view = await loadRoadmapView(rm[0]);
      const next = view.steps.find((s) => s.id === view.nextStepId) ?? null;
      courses.push({
        courseId: c.id, courseName: c.name, isCurrent: !!c.is_current, roadmapId: c.roadmap_id, status: c.status,
        total: view.counts.total, learned: view.counts.learned, learning: view.counts.learning,
        nextStep: next ? { id: next.id, title: next.title, estimatedMinutes: next.estimatedMinutes } : null,
      });
    }
    const { rows: counts } = await pool.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE mastery = 'learned')::int AS learned,
              count(*) FILTER (WHERE mastery = 'learning')::int AS learning FROM skills`,
    );
    return { content: [{ type: 'text', text: JSON.stringify({ courses, skills: counts[0] }, null, 2) }] };
  },
);

// find_videos — ranked for a skill or a roadmap step (which is a skill).
// Uses the shared search cache; force=true re-runs the YouTube search+judge
// (minutes, billable). Slimmed to what matters.
const slimVideo = (v: RankedVideo) => ({
  id: v.id, title: v.title, channel: v.channel, url: v.url, duration_min: Math.round(v.durationSeconds / 60),
  score: Math.round(v.score * 100) / 100, unlearned_milestones: v.unlearnedMilestones, summary: clip(v.summary, 300),
});
mcp.tool(
  'find_videos',
  `Find learning videos for a roadmap step or skill, ranked by coverage of what you haven't learned yet.
Pass step_id (preferred) or skill_id. Results are cached per skill; force=true re-runs the YouTube search (slow).`,
  {
    step_id: z.string().optional().describe('Roadmap step id (from get_roadmap) — resolves its skill'),
    skill_id: z.string().optional().describe('Skill id (e.g. from get_learning_overview)'),
    force: z.boolean().default(false).describe('Re-run the YouTube search even if cached results are fresh'),
  },
  async ({ step_id, skill_id, force }, extra) => {
    let targetId = skill_id ?? '';
    if (step_id) {
      const step = await loadOwnedStep(step_id, uidOf(extra));
      if (!step) return { content: [{ type: 'text', text: 'Step not found.' }] };
      targetId = step.skill_id;
    }
    if (!targetId) return { content: [{ type: 'text', text: 'Pass step_id or skill_id.' }] };
    const { rows: skillRows } = await pool.query(
      'SELECT id, label, video_search_status, video_searched_at FROM skills WHERE id = $1',
      [targetId],
    );
    if (!skillRows.length) return { content: [{ type: 'text', text: 'Skill not found.' }] };
    const s = skillRows[0];
    const fresh =
      s.video_search_status === 'done' && s.video_searched_at &&
      Date.now() - new Date(s.video_searched_at).getTime() < SEARCH_TTL_MS;
    const cached = fresh && !force;
    const videos = cached
      ? await rankVideos({ skillIds: [targetId], includeLearned: true })
      : await searchVideosForSkill(targetId);
    // Same bar as the per-skill REST view: skip videos that barely touch the topic.
    const relevant = videos.filter((v) => v.milestones.some((m) => m.skillId === targetId && m.coverage >= COVERAGE_FLOOR));
    const slim = relevant.slice(0, 10).map(slimVideo);
    return { content: [{ type: 'text', text: JSON.stringify({ skillId: targetId, label: s.label, cached, videos: slim }, null, 2) }] };
  },
);

// ── Write tools ─────────────────────────────────────────────────────────────

// add_flashcards — deck + cards in one shot (skips the AI generate pipeline;
// the MCP client IS the generator)
mcp.tool(
  'add_flashcards',
  'Create a flashcard deck with cards (front/back pairs). Use for "make me a deck about X from document Y".',
  {
    title: z.string().describe('Deck title'),
    description: z.string().optional(),
    course_id: z.string().optional().describe('Link the deck to a course'),
    source: z.object({ type: z.string(), id: z.string().optional(), label: z.string().optional() }).optional().describe('Where the cards came from, e.g. {type: "document", id: "..."}'),
    cards: z.array(z.object({ front: z.string(), back: z.string() })).min(1).max(50).describe('front/back pairs'),
  },
  async ({ title, description, course_id, source, cards }, extra) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const deck = await client.query(
        `INSERT INTO flashcard_decks (user_id, title, description, course_id, source, config, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'ready') RETURNING id, title`,
        [uidOf(extra), title, description ?? null, course_id ?? null, JSON.stringify(source ?? { type: 'mcp' }), JSON.stringify({ count: cards.length })],
      );
      for (let i = 0; i < cards.length; i++) {
        await client.query(
          `INSERT INTO flashcards (deck_id, front, back, position) VALUES ($1, $2, $3, $4)`,
          [deck.rows[0].id, cards[i].front, cards[i].back, i],
        );
      }
      await client.query('COMMIT');
      return { content: [{ type: 'text', text: `Created deck "${deck.rows[0].title}" (${deck.rows[0].id}) with ${cards.length} cards.` }] };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },
);

// log_review — same stats update as POST /api/flashcard-decks/cards/:cardId/review
mcp.tool(
  'log_review',
  'Log a flashcard review result (correct/incorrect) and update its stats.',
  { card_id: z.string(), correct: z.boolean() },
  async ({ card_id, correct }) => {
    const card = await pool.query('SELECT review_stats FROM flashcards WHERE id = $1', [card_id]);
    if (!card.rows.length) return { content: [{ type: 'text', text: 'Card not found.' }] };
    const stats = card.rows[0].review_stats ?? {};
    const updated = {
      timesReviewed: (stats.timesReviewed || 0) + 1,
      timesCorrect: (stats.timesCorrect || 0) + (correct ? 1 : 0),
      lastReviewedAt: new Date().toISOString(),
    };
    const { rows } = await pool.query(
      'UPDATE flashcards SET review_stats = $1, updated_at = NOW() WHERE id = $2 RETURNING id, review_stats',
      [JSON.stringify(updated), card_id],
    );
    return { content: [{ type: 'text', text: JSON.stringify(rows[0]) }] };
  },
);

// ── Step learning: strategies + videos ──────────────────────────────────────
// Same generators the REST route uses — the MCP client IS the strategy
// generator here, exactly like add_flashcards. Steps are owned via
// roadmap → course → user.

async function loadOwnedStep(stepId: string, userId: string) {
  const { rows } = await pool.query(
    `SELECT s.*, r.course_id, c.name AS course_name
       FROM roadmap_steps s JOIN roadmaps r ON r.id = s.roadmap_id JOIN courses c ON c.id = r.course_id
      WHERE s.id = $1 AND c.user_id = $2`,
    [stepId, userId],
  );
  return rows[0] ?? null;
}

type ActivityKind = 'lesson' | 'podcast' | 'flashcards' | 'quiz' | 'recall' | 'discussion' | 'diagram' | 'slides';
const STEP_GENERATORS: Record<ActivityKind, (ctx: StepContext, g: string) => Promise<unknown>> = {
  lesson: (ctx, g) => buildLesson(ctx, g),
  podcast: (ctx, g) => buildPodcast(ctx, g),
  flashcards: async (ctx, g) => {
    const c = await buildFlashcards(ctx, g);
    if (c.cards.length === 0) throw new Error('The tutor could not write cards for this topic');
    return c;
  },
  quiz: async (ctx, g) => {
    const q = await buildQuiz(ctx, g);
    if (q.questions.length === 0) throw new Error('The tutor could not write questions for this topic');
    return q;
  },
  recall: (ctx, g) => buildRecall(ctx, g),
  discussion: (ctx, g) => openDiscussion(ctx, g),
  diagram: (ctx, g) => buildDiagram(ctx, g),
  slides: async (ctx, g) => {
    const d = await buildSlides(ctx, g);
    if (d.slides.length < 3) throw new Error('The tutor could not build a full slide deck');
    return d;
  },
};

type StepKind = keyof typeof STEP_GENERATORS;

// generate_step_strategies
mcp.tool(
  'generate_step_strategies',
  `Generate learning strategies (activities) for a roadmap step. Each call is one LLM generation —
generate strategies one at a time (lesson first), and only the ones you need. 60s+ per call.`,
  {
    step_id: z.string().describe('Step id (from get_roadmap)'),
    kind: z.enum(['lesson', 'podcast', 'flashcards', 'quiz', 'recall', 'discussion', 'diagram', 'slides'])
      .describe('lesson (recommended first), podcast, flashcards, quiz, recall, discussion, diagram, slides'),
  },
  async ({ step_id, kind }, extra) => {
    const userId = uidOf(extra);
    const step = await loadOwnedStep(step_id, userId);
    if (!step) return { content: [{ type: 'text', text: 'Step not found.' }] };
    const { rows } = await pool.query(
      `SELECT id, kind, status FROM learning_activities
        WHERE step_id = $1 AND kind = $2 AND status <> 'completed' LIMIT 1`,
      [step_id, kind],
    );
    if (rows.length) {
      return { content: [{ type: 'text', text: JSON.stringify({ activityId: rows[0].id, kind, status: rows[0].status, reused: true }, null, 2) }] };
    }
    const ctx = {
      courseName: step.course_name,
      title: step.title,
      description: step.description,
      objectives: Array.isArray(step.objectives) ? step.objectives : [],
      keyPoints: Array.isArray(step.key_points) ? step.key_points : [],
      sourceRefs: (Array.isArray(step.source_refs) ? step.source_refs : []) as StepContext['sourceRefs'],
    };
    const grounding = await groundingText(ctx);
    const content = await STEP_GENERATORS[kind as StepKind](ctx, grounding);
    const inserted = await pool.query(
      `INSERT INTO learning_activities (step_id, kind, status, content, started_at)
       VALUES ($1, $2, 'in_progress', $3::jsonb, now()) RETURNING id`,
      [step_id, kind, JSON.stringify(content)],
    );
    const activityId = inserted.rows[0].id as string;
    const summary =
      kind === 'lesson' ? `${(content as LessonContent).checkpoints.length} checkpoints` :
      kind === 'podcast' ? `${(content as PodcastContent).lines.length} script lines` :
      kind === 'quiz' ? `${(content as { questions: unknown[] }).questions.length} questions` :
      kind === 'flashcards' ? `${(content as { cards: unknown[] }).cards.length} cards` :
      kind === 'recall' ? `${(content as { rubric: string[] }).rubric.length} rubric points` :
      kind === 'discussion' ? 'Socratic session open' :
      kind === 'slides' ? `${(content as { slides: unknown[] }).slides.length} slides` :
      `${(content as { rubric: string[] }).rubric.length} rubric points`;
    if (kind === 'podcast') {
      // ponytail: TTS render runs fire-and-forget (1-4 min) — mirror the REST
      // behavior so audioPath/renderError land in content while the caller
      // already has the transcript.
      const attach = (patch: object) =>
        pool.query(
          "UPDATE learning_activities SET content = content || $1::jsonb, updated_at = now() WHERE id = $2 AND status <> 'completed'",
          [JSON.stringify(patch), activityId],
        );
      void synthesizePodcastAudio(activityId, content as PodcastContent)
        .then((audioPath) => attach({ audioPath }))
        .catch((err: unknown) => attach({ renderError: err instanceof Error ? err.message : String(err) }));
    }
    return { content: [{ type: 'text', text: JSON.stringify({ activityId, kind, status: 'in_progress', summary }, null, 2) }] };
  },
);

// get_step_strategies
mcp.tool(
  'get_step_strategies',
  "List a step's learning strategies: which of the 7 exist, their status, and each activity's id.",
  { step_id: z.string().describe('Step id (from get_roadmap)') },
  async ({ step_id }, extra) => {
    const userId = uidOf(extra);
    const step = await loadOwnedStep(step_id, userId);
    if (!step) return { content: [{ type: 'text', text: 'Step not found.' }] };
    const { rows } = await pool.query(
      `SELECT id, kind, status, started_at, completed_at FROM learning_activities
        WHERE step_id = $1 ORDER BY created_at ASC`,
      [step_id],
    );
    return { content: [{ type: 'text', text: JSON.stringify({ stepId: step_id, activities: rows }, null, 2) }] };
  },
);

// ── File tree management ─────────────────────────────────────────────────────
// Write tools for documents + the hierarchical folder tree. Same invariants as
// the REST routes: ownership checks on every id, folder cycle detection on
// move, storage object cleanup on delete. Content is text or base64 (MCP is
// JSON-RPC — no multipart), so big binary uploads still belong to the browser.

const MIME_MAX = 20 * 1024 * 1024; // ponytail: matches the REST upload feel; harden if abuse shows up

// Resolve "path/like/Name" or a plain folder id to a folder id. Splits MCP
// clients from having to know folder ids; paths are matched case-insensitively.
async function resolveFolder(ref: string | undefined, userId: string): Promise<string | null | { error: string }> {
  if (!ref || !ref.trim()) return null; // root
  const raw = ref.trim().replace(/^\/+|\/+$/g, '');
  if (!raw) return null;
  const { rows } = await pool.query('SELECT id, name, parent_id FROM folders WHERE user_id = $1', [userId]);
  if (rows.some((r) => r.id === raw)) return raw; // exact id wins
  const segments = raw.split('/').map((s) => s.trim().toLowerCase()).filter(Boolean);
  let parentId: string | null = null;
  for (const seg of segments) {
    const matches = rows.filter((r) => r.name.toLowerCase() === seg && (r.parent_id ?? null) === parentId);
    if (matches.length !== 1) {
      return { error: matches.length === 0 ? `Folder not found: "${seg}"` : `Ambiguous folder name: "${seg}"` };
    }
    parentId = matches[0].id;
  }
  return parentId;
}

// Walk up from a folder to detect cycles (used by move_folder). True if `child`
// would create a loop, i.e. `candidateParent` is inside child's subtree.
async function wouldCycle(child: string, candidateParent: string, userId: string): Promise<boolean> {
  let cur: string | null = candidateParent;
  const seen = new Set<string>();
  while (cur) {
    if (cur === child) return true;
    if (seen.has(cur)) break;
    seen.add(cur);
    const { rows } = await pool.query('SELECT parent_id FROM folders WHERE id = $1 AND user_id = $2', [cur, userId]);
    if (!rows.length) break;
    cur = rows[0].parent_id as string | null;
  }
  return false;
}

function extOf(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : 'bin';
}

// add_document — text or base64 content into storage + documents row
mcp.tool(
  'add_document',
  'Create a document in the Inkwell library: upload text (or base64) content, optionally into a folder.',
  {
    name: z.string().describe('File name with extension, e.g. "notes.md" — the extension sets the type'),
    content: z.string().describe('File content (text, or base64 when encoding="base64")'),
    encoding: z.enum(['text', 'base64']).default('text').describe('How "content" is encoded'),
    folder: z.string().optional().describe('Destination: folder id or path like "Courses/ML" — omit for library root'),
  },
  async ({ name, content, encoding, folder }, extra) => {
    const userId = uidOf(extra);
    const clean = name.replace(/[/\\:*?"<>|]/g, '_').trim() || 'untitled.txt';
    const dest = await resolveFolder(folder, userId);
    if (dest && typeof dest === 'object') return { content: [{ type: 'text', text: dest.error }] };
    const buf = encoding === 'base64'
      ? Buffer.from(content.replace(/\s/g, ''), 'base64')
      : Buffer.from(content, 'utf8');
    if (!buf.length) return { content: [{ type: 'text', text: 'Content is empty.' }] };
    if (buf.length > MIME_MAX) return { content: [{ type: 'text', text: `Content too large (${buf.length} bytes; max ${MIME_MAX}).` }] };
    const ext = extOf(clean);
    const mime = mimeForExt(ext);
    const id = randomUUID();
    const storagePath = `${id}_${clean}`;
    try {
      await storageUpload(storagePath, buf, mime);
      await pool.query(
        `INSERT INTO documents (id, name, type, mime_type, size, file_path, user_id, folder_id, classify_status, summary_status, podcast_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'skipped', 'skipped', 'skipped')`,
        [id, clean, typeForExt(ext, mime), mime, buf.length, storagePath, userId, dest],
      );
    } catch (err) {
      try { await storageDelete(storagePath); } catch { /* nothing to clean */ }
      return { content: [{ type: 'text', text: `Failed to create document: ${String(err)}` }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify({ id, name: clean, type: typeForExt(ext, mime), size: buf.length, folderId: dest }, null, 2) }] };
  },
);

// create_folder — nested via parent path/id
mcp.tool(
  'create_folder',
  'Create a folder in the Inkwell file tree, optionally nested inside another folder.',
  {
    name: z.string().describe('Folder name'),
    parent: z.string().optional().describe('Parent folder id or path — omit for root'),
  },
  async ({ name, parent }, extra) => {
    const userId = uidOf(extra);
    const clean = name.replace(/[/\\:*?"<>|]/g, '_').trim();
    if (!clean) return { content: [{ type: 'text', text: 'Folder name is required.' }] };
    const dest = await resolveFolder(parent, userId);
    if (dest && typeof dest === 'object') return { content: [{ type: 'text', text: dest.error }] };
    const id = randomUUID();
    const { rows } = await pool.query(
      'INSERT INTO folders (id, user_id, name, parent_id) VALUES ($1, $2, $3, $4) RETURNING id, name, parent_id',
      [id, userId, clean, dest],
    );
    const r = rows[0] as { id: string; name: string; parent_id: string | null };
    return { content: [{ type: 'text', text: JSON.stringify({ id: r.id, name: r.name, parentId: r.parent_id }, null, 2) }] };
  },
);

// list_tree — folders + docs so clients can navigate without ids
mcp.tool(
  'list_tree',
  'List the file tree: every folder (with parent) and document (with its folder), so you can address items by path.',
  {},
  async (_args, extra) => {
    const userId = uidOf(extra);
    const { rows: folders } = await pool.query(
      'SELECT id, name, parent_id FROM folders WHERE user_id = $1 ORDER BY name COLLATE "C"', [userId],
    );
    const { rows: docs } = await pool.query(
      `SELECT d.id, d.name, d.type, d.size, d.folder_id
         FROM documents d LEFT JOIN document_folder_links l ON l.document_id = d.id
        WHERE d.user_id = $1 AND d.textbook_id IS NULL
        GROUP BY d.id ORDER BY d.name COLLATE "C"`,
      [userId],
    );
    const byPath = new Map<string, string>();
    const pathOf = (id: string, parentId: string | null, name: string): string => {
      if (byPath.has(id)) return byPath.get(id)!;
      const parent = parentId ? folders.find((f) => f.id === parentId) : undefined;
      const p = parent ? `${pathOf(parent.id, parent.parent_id, parent.name)}/${name}` : `/${name}`;
      byPath.set(id, p);
      return p;
    };
    const folderList = (folders as Array<{ id: string; name: string; parent_id: string | null }>).map((f) => ({ id: f.id, path: pathOf(f.id, f.parent_id, f.name) }));
    const folderById = new Map(folderList.map((f) => [f.id, f.path]));
    const docList = (docs as Array<{ id: string; name: string; type: string; size: number; folder_id: string | null }>).map((d) => ({
      id: d.id, name: d.name, type: d.type, size: d.size, folderId: d.folder_id, path: d.folder_id ? `${folderById.get(d.folder_id) ?? '?'}/${d.name}` : `/${d.name}`,
    }));
    return { content: [{ type: 'text', text: JSON.stringify({ folders: folderList, documents: docList }, null, 2) }] };
  },
);

// move_document — physical move or soft-link (mirrors POST /:id/links)
mcp.tool(
  'move_document',
  'Move a document into a folder. Set link=true to soft-link (leave a copy visible in the current folder) instead of a physical move.',
  {
    document_id: z.string().describe('Document id (from list_tree or list_documents)'),
    folder: z.string().optional().describe('Destination folder id or path — omit to move to library root'),
    link: z.boolean().default(false).describe('Soft-link instead of move'),
  },
  async ({ document_id, folder, link }, extra) => {
    const userId = uidOf(extra);
    const dest = await resolveFolder(folder, userId);
    if (dest && typeof dest === 'object') return { content: [{ type: 'text', text: dest.error }] };
    if (!dest && link) return { content: [{ type: 'text', text: 'Soft-links need a destination folder (a link to the root is the document itself).' }] };
    const { rows } = await pool.query('SELECT id, folder_id FROM documents WHERE id = $1 AND user_id = $2', [document_id, userId]);
    if (!rows.length) return { content: [{ type: 'text', text: 'Document not found.' }] };
    if (link) {
      await pool.query('INSERT INTO document_folder_links (document_id, folder_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [document_id, dest]);
      return { content: [{ type: 'text', text: `Linked into ${dest}.` }] };
    }
    await pool.query('UPDATE documents SET folder_id = $1, updated_at = NOW() WHERE id = $2', [dest, document_id]);
    // A physical move out of a folder invalidates its soft-links there
    await pool.query('DELETE FROM document_folder_links WHERE document_id = $1 AND folder_id = $2', [document_id, dest]);
    return { content: [{ type: 'text', text: `Moved to ${dest ?? 'root'}.` }] };
  },
);

// move_folder — rename/re-parent with cycle detection
mcp.tool(
  'move_folder',
  'Rename a folder and/or move it under a new parent (cycle-safe: cannot move into its own subtree).',
  {
    folder_id: z.string().describe('Folder id (from list_tree)'),
    name: z.string().optional().describe('New name'),
    parent: z.string().optional().describe('New parent folder id or path; use "" or omit extra to move to root'),
    to_root: z.boolean().default(false).describe('Explicitly move the folder to the root'),
  },
  async ({ folder_id, name, parent, to_root }, extra) => {
    const userId = uidOf(extra);
    if (!name && !parent && !to_root) return { content: [{ type: 'text', text: 'Nothing to do: pass name, parent, or to_root.' }] };
    const { rowCount } = await pool.query('SELECT 1 FROM folders WHERE id = $1 AND user_id = $2', [folder_id, userId]);
    if (!rowCount) return { content: [{ type: 'text', text: 'Folder not found.' }] };
    const sets: string[] = [];
    const values: unknown[] = [];
    if (name?.trim()) { sets.push('name = $1'); values.push(name.replace(/[/\\:*?"<>|]/g, '_').trim()); }
    if (to_root) {
      sets.push('parent_id = NULL');
    } else if (parent !== undefined) {
      const dest = await resolveFolder(parent || undefined, userId);
      if (dest && typeof dest === 'object') return { content: [{ type: 'text', text: dest.error }] };
      if (dest === folder_id) return { content: [{ type: 'text', text: 'A folder cannot be its own parent.' }] };
      if (dest && await wouldCycle(folder_id, dest, userId)) return { content: [{ type: 'text', text: 'Cannot move a folder into its own subtree.' }] };
      sets.push(`parent_id = $${values.length + 1}`);
      values.push(dest);
    }
    if (!sets.length) return { content: [{ type: 'text', text: 'No changes resolved from the arguments.' }] };
    values.push(folder_id, userId);
    await pool.query(`UPDATE folders SET ${sets.join(', ')} WHERE id = $${values.length - 1} AND user_id = $${values.length}`, values);
    return { content: [{ type: 'text', text: 'Folder updated.' }] };
  },
);

// delete_document — storage cleanup, mirrors the REST delete
mcp.tool(
  'delete_document',
  'Permanently delete a document and its stored file.',
  { document_id: z.string().describe('Document id (from list_tree or list_documents)') },
  async ({ document_id }, extra) => {
    const userId = uidOf(extra);
    const { rows } = await pool.query('SELECT file_path, podcast_path FROM documents WHERE id = $1 AND user_id = $2', [document_id, userId]);
    if (!rows.length) return { content: [{ type: 'text', text: 'Document not found.' }] };
    const filePath = (rows[0] as { file_path: string | null }).file_path;
    if (filePath && isStorageKey(filePath)) {
      try { await storageDelete(filePath); } catch { /* already gone */ }
    }
    await pool.query('DELETE FROM documents WHERE id = $1', [document_id]);
    return { content: [{ type: 'text', text: 'Document deleted.' }] };
  },
);

// delete_folder — contents are promoted (same behavior as the UI delete)
mcp.tool(
  'delete_folder',
  'Delete a folder. Child folders and documents inside are promoted to the parent level, not deleted.',
  { folder_id: z.string().describe('Folder id (from list_tree)') },
  async ({ folder_id }, extra) => {
    const userId = uidOf(extra);
    const { rowCount } = await pool.query('DELETE FROM folders WHERE id = $1 AND user_id = $2', [folder_id, userId]);
    if (!rowCount) return { content: [{ type: 'text', text: 'Folder not found.' }] };
    return { content: [{ type: 'text', text: 'Folder deleted; contents promoted.' }] };
  },
);

// ── Roadmap authoring ────────────────────────────────────────────────────────
// Create + adjust roadmaps directly: full control over steps, objectives and
// document links (source_refs), the same shapes the AI generator persists.
// Skills upsert by slug so cross-course mastery is shared, and dependsOn is
// clamped to earlier steps (same acyclicity rule as the generator).

interface McpStepInput {
  title: string;
  description?: string;
  objectives?: string[];
  keyPoints?: string[];
  estimatedMinutes?: number;
  documentIds?: string[];
  dependsOn?: string[]; // titles of earlier steps
}

// Shared persist path for create_roadmap / update_roadmap: replaces all steps
// of `roadmapId` with `steps` inside a transaction, upserting skills by slug.
// `docTitles` maps documentId → title for source_refs (owned docs only).
async function persistSteps(
  roadmapId: string,
  steps: McpStepInput[],
  docTitles: Map<string, string>,
): Promise<{ id: string; title: string }[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM roadmap_steps WHERE roadmap_id = $1', [roadmapId]);
    const stepIdBySlug = new Map<string, string>();
    const inserted: Array<{ id: string; dependsOn: string[] }> = [];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const slug = skillSlug(s.title);
      const { rows: sk } = await client.query(
        `INSERT INTO skills (slug, label, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (slug) DO UPDATE SET
           description = CASE WHEN skills.description = '' THEN EXCLUDED.description ELSE skills.description END,
           updated_at = now()
         RETURNING id`,
        [slug, s.title.trim(), s.description?.trim() ?? ''],
      );
      const sourceRefs = (s.documentIds ?? [])
        .filter((d) => docTitles.has(d))
        .map((documentId) => ({ documentId, title: docTitles.get(documentId)! }));
      const { rows: st } = await client.query(
        `INSERT INTO roadmap_steps (roadmap_id, skill_id, position, title, description, objectives, key_points, source_refs, estimated_minutes)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9)
         RETURNING id`,
        [roadmapId, sk[0].id, i, s.title.trim(), s.description?.trim() ?? '',
         JSON.stringify((s.objectives ?? []).filter(Boolean)), JSON.stringify((s.keyPoints ?? []).filter(Boolean)),
         JSON.stringify(sourceRefs), Math.max(1, Math.round(s.estimatedMinutes ?? 15))],
      );
      stepIdBySlug.set(slug, st[0].id as string);
      inserted.push({ id: st[0].id as string, dependsOn: s.dependsOn ?? [] });
    }
    // dependsOn titles → step ids; only earlier steps, deduped (acyclic by construction)
    for (let i = 0; i < inserted.length; i++) {
      const deps = inserted[i].dependsOn
        .map((t) => stepIdBySlug.get(skillSlug(t)))
        .filter((d): d is string => !!d && d !== inserted[i].id)
        .filter((d) => inserted.findIndex((x) => x.id === d) < i);
      await client.query('UPDATE roadmap_steps SET depends_on = $1::jsonb WHERE id = $2', [
        JSON.stringify([...new Set(deps)]), inserted[i].id,
      ]);
    }
    await client.query('COMMIT');
    return steps.map((s, i) => ({ id: inserted[i].id, title: s.title.trim() }));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Owned doc titles for source_refs, given explicit ids or library-wide.
async function docTitleMap(userId: string, ids?: string[]): Promise<Map<string, string>> {
  if (ids && ids.length === 0) return new Map();
  const { rows } = ids && ids.length
    ? await pool.query('SELECT id, name FROM documents WHERE user_id = $1 AND id = ANY($2)', [userId, ids])
    : await pool.query(`SELECT id, name FROM documents WHERE user_id = $1 AND textbook_id IS NULL`, [userId]);
  return new Map((rows as Array<{ id: string; name: string }>).map((r) => [r.id, r.name]));
}

// list_courses — agents need course ids to create roadmaps
mcp.tool(
  'list_courses',
  'List courses with their active roadmap, so you can target create_roadmap / update_roadmap calls.',
  {},
  async (_args, extra) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.is_current, r.id AS roadmap_id, r.title AS roadmap_title, r.status AS roadmap_status
         FROM courses c LEFT JOIN roadmaps r ON r.course_id = c.id AND r.is_active
        WHERE c.user_id = $1 ORDER BY c.is_current DESC, c.updated_at DESC`,
      [uidOf(extra)],
    );
    return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
  },
);

// create_roadmap — full authoring in one call
mcp.tool(
  'create_roadmap',
  `Create a complete roadmap for a course, exactly as you design it: ordered steps with title, description,
objectives, key points, estimated minutes, links to uploaded documents, and dependencies between steps.
Replaces any existing steps of the course's active roadmap ONLY if replace_existing=true; otherwise the
course must have no roadmap yet.`,
  {
    course_id: z.string().describe('Course id (from list_courses)'),
    title: z.string().describe('Roadmap title, e.g. "Machine Learning Fundamentals"'),
    overview: z.string().default('').describe('One-paragraph description of the learning path'),
    steps: z.array(z.object({
      title: z.string().describe('Step/topic title — becomes the shared skill label'),
      description: z.string().optional(),
      objectives: z.array(z.string()).default([]).describe('What the learner will be able to do'),
      keyPoints: z.array(z.string()).default([]),
      estimatedMinutes: z.number().int().min(1).max(600).default(15),
      documentIds: z.array(z.string()).default([]).describe('Uploaded document ids to link as reading material (from list_tree / list_documents)'),
      dependsOn: z.array(z.string()).default([]).describe('Titles of EARLIER steps this one builds on'),
    })).min(1).max(50).describe('Ordered steps'),
    replace_existing: z.boolean().default(false).describe('Allow replacing steps of the course\'s existing active roadmap'),
  },
  async ({ course_id, title, overview, steps, replace_existing }, extra) => {
    const userId = uidOf(extra);
    const { rows: course } = await pool.query('SELECT id, name FROM courses WHERE id = $1 AND user_id = $2', [course_id, userId]);
    if (!course.length) return { content: [{ type: 'text', text: 'Course not found.' }] };
    const { rows: existing } = await pool.query(
      'SELECT id, status FROM roadmaps WHERE course_id = $1 AND is_active ORDER BY created_at DESC LIMIT 1', [course_id],
    );
    if (existing.length && existing[0].status === 'generating') {
      return { content: [{ type: 'text', text: 'A roadmap is currently generating for this course — try again later.' }] };
    }
    if (existing.length && !replace_existing) {
      return { content: [{ type: 'text', text: 'Course already has an active roadmap. Pass replace_existing=true to rewrite its steps, or use update_roadmap for smaller adjustments.' }] };
    }
    const titles = await docTitleMap(userId, [...new Set(steps.flatMap((s) => s.documentIds ?? []))]);
    let roadmapId: string;
    if (existing.length) {
      roadmapId = existing[0].id;
      await pool.query('UPDATE roadmaps SET title = $1, overview = $2, status = \'done\', error = NULL, updated_at = now() WHERE id = $3',
        [title.trim(), overview, roadmapId]);
    } else {
      const { rows } = await pool.query(
        `INSERT INTO roadmaps (course_id, title, overview, status, is_active, user_id) VALUES ($1, $2, $3, 'done', true, $4) RETURNING id`,
        [course_id, title.trim(), overview, userId],
      );
      roadmapId = rows[0].id as string;
    }
    const made = await persistSteps(roadmapId, steps, titles);
    const view = await loadRoadmapView((await pool.query('SELECT * FROM roadmaps WHERE id = $1', [roadmapId])).rows[0]);
    return { content: [{ type: 'text', text: JSON.stringify({ roadmapId, title, stepsCreated: made.length, view: { nextStepId: view.nextStepId, counts: view.counts } }, null, 2) }] };
  },
);

// update_roadmap — surgical adjustments
mcp.tool(
  'update_roadmap',
  `Adjust an existing roadmap without redesigning it: retitle, add a step (at any position), rewrite or
remove steps, reorder, or set which version is active. Any omitted field is left unchanged.`,
  {
    roadmap_id: z.string().describe('Roadmap id (from list_courses or get_roadmap)'),
    title: z.string().optional().describe('New roadmap title'),
    overview: z.string().optional().describe('New roadmap overview'),
    activate: z.boolean().optional().describe('Make this the course\'s active roadmap version'),
    add_steps: z.array(z.object({
      title: z.string(),
      description: z.string().optional(),
      objectives: z.array(z.string()).default([]),
      keyPoints: z.array(z.string()).default([]),
      estimatedMinutes: z.number().int().min(1).max(600).default(15),
      documentIds: z.array(z.string()).default([]),
      dependsOn: z.array(z.string()).default([]).describe('Titles of earlier steps this one builds on'),
      at_position: z.number().int().min(0).optional().describe('Insert position (0-based); omit to append'),
    })).max(20).optional(),
    update_steps: z.array(z.object({
      match: z.string().describe('Title (or id) of the step to change'),
      title: z.string().optional().describe('New title (renames the shared skill label too)'),
      description: z.string().optional(),
      objectives: z.array(z.string()).optional(),
      keyPoints: z.array(z.string()).optional(),
      estimatedMinutes: z.number().int().min(1).max(600).optional(),
      documentIds: z.array(z.string()).optional().describe('Replace the linked documents'),
    })).max(20).optional(),
    remove_steps: z.array(z.string()).max(20).optional().describe('Titles (or ids) of steps to remove'),
    move_step: z.object({
      match: z.string(),
      to_position: z.number().int().min(0),
    }).optional(),
  },
  async ({ roadmap_id, title, overview, activate, add_steps, update_steps, remove_steps, move_step }, extra) => {
    const userId = uidOf(extra);
    const { rows: rm } = await pool.query(
      `SELECT r.* FROM roadmaps r JOIN courses c ON c.id = r.course_id WHERE r.id = $1 AND c.user_id = $2`,
      [roadmap_id, userId],
    );
    if (!rm.length) return { content: [{ type: 'text', text: 'Roadmap not found.' }] };
    if (rm[0].status === 'generating') return { content: [{ type: 'text', text: 'That roadmap is currently generating.' }] };

    // Activate is the one adjustment that doesn't rewrite steps.
    if (activate) {
      await pool.query('UPDATE roadmaps SET is_active = false WHERE course_id = $1 AND is_active', [rm[0].course_id]);
      await pool.query('UPDATE roadmaps SET is_active = true, updated_at = now() WHERE id = $1', [roadmap_id]);
    }

    const touched = add_steps || update_steps || remove_steps || move_step;
    if (title !== undefined || overview !== undefined) {
      await pool.query('UPDATE roadmaps SET title = COALESCE($1, title), overview = COALESCE($2, overview), updated_at = now() WHERE id = $3',
        [title?.trim() ?? null, overview ?? null, roadmap_id]);
    }
    if (!touched) {
      return { content: [{ type: 'text', text: activate ? 'Roadmap activated.' : 'Nothing to change.' }] };
    }

    // Load current steps, apply edits in memory, persist through the shared path.
    const { rows: stepRows } = await pool.query<{
      id: string; title: string; description: string; objectives: string[]; key_points: string[];
      source_refs: Array<{ documentId: string }>; estimated_minutes: number;
    }>(
      'SELECT id, title, description, objectives, key_points, source_refs, estimated_minutes FROM roadmap_steps WHERE roadmap_id = $1 ORDER BY position',
      [roadmap_id],
    );
    const steps: McpStepInput[] = stepRows.map((r) => ({
      title: r.title, description: r.description, objectives: r.objectives ?? [], keyPoints: r.key_points ?? [],
      estimatedMinutes: r.estimated_minutes, documentIds: (r.source_refs ?? []).map((x) => x.documentId),
      dependsOn: [],
    }));
    const docIdsUsed = [...new Set(steps.flatMap((s) => s.documentIds ?? []))];

    for (const add of add_steps ?? []) {
      const at = add.at_position ?? steps.length;
      steps.splice(Math.min(Math.max(at, 0), steps.length), 0, {
        title: add.title, description: add.description, objectives: add.objectives ?? [], keyPoints: add.keyPoints ?? [],
        estimatedMinutes: add.estimatedMinutes, documentIds: add.documentIds ?? [], dependsOn: add.dependsOn ?? [],
      });
    }
    for (const m of remove_steps ?? []) {
      const i = steps.findIndex((s) => s.title.toLowerCase() === m.toLowerCase());
      if (i < 0) return { content: [{ type: 'text', text: `Step not found: "${m}"` }] };
      steps.splice(i, 1);
    }
    for (const upd of update_steps ?? []) {
      const s = typeof upd === 'object' ? steps.find((x) => x.title.toLowerCase() === upd.match.toLowerCase()) : undefined;
      if (!s) return { content: [{ type: 'text', text: `Step not found: "${upd.match}"` }] };
      if (upd.title !== undefined) s.title = upd.title;
      if (upd.description !== undefined) s.description = upd.description;
      if (upd.objectives !== undefined) s.objectives = upd.objectives.filter(Boolean);
      if (upd.keyPoints !== undefined) s.keyPoints = upd.keyPoints.filter(Boolean);
      if (upd.estimatedMinutes !== undefined) s.estimatedMinutes = upd.estimatedMinutes;
      if (upd.documentIds !== undefined) s.documentIds = upd.documentIds;
    }
    if (move_step) {
      const from = steps.findIndex((s) => s.title.toLowerCase() === move_step.match.toLowerCase());
      if (from < 0) return { content: [{ type: 'text', text: `Step not found: "${move_step.match}"` }] };
      const [s] = steps.splice(from, 1);
      steps.splice(Math.min(Math.max(move_step.to_position, 0), steps.length), 0, s);
    }

    const docIdsWanted = [...new Set([...docIdsUsed, ...steps.flatMap((s) => s.documentIds ?? [])])];
    const titles = await docTitleMap(userId, docIdsWanted);
    await pool.query('UPDATE roadmaps SET updated_at = now() WHERE id = $1', [roadmap_id]);
    const made = await persistSteps(roadmap_id, steps, titles);
    return { content: [{ type: 'text', text: JSON.stringify({ steps: made.length }, null, 2) }] };
  },
);

// delete_roadmap — same semantics as DELETE /api/roadmaps/:id: refuse while
// generating; if it was active, promote the newest finished sibling.
mcp.tool(
  'delete_roadmap',
  "Delete a roadmap version. If it was the course's active roadmap, the newest finished sibling is promoted automatically.",
  { roadmap_id: z.string().describe('Roadmap id (from list_courses)') },
  async ({ roadmap_id }, extra) => {
    const userId = uidOf(extra);
    const { rows } = await pool.query(
      `SELECT r.is_active, r.course_id, r.status FROM roadmaps r JOIN courses c ON c.id = r.course_id
        WHERE r.id = $1 AND c.user_id = $2`,
      [roadmap_id, userId],
    );
    if (!rows.length) return { content: [{ type: 'text', text: 'Roadmap not found.' }] };
    if (rows[0].status === 'generating') return { content: [{ type: 'text', text: 'That roadmap is still generating.' }] };
    await pool.query('DELETE FROM roadmaps WHERE id = $1', [roadmap_id]); // steps + activities cascade
    if (rows[0].is_active) {
      await pool.query(
        `UPDATE roadmaps SET is_active = true WHERE id = (
           SELECT id FROM roadmaps WHERE course_id = $1 AND status = 'done'
           ORDER BY created_at DESC LIMIT 1)`,
        [rows[0].course_id],
      );
    }
    return { content: [{ type: 'text', text: 'Roadmap deleted.' }] };
  },
);

// ── HTTP wiring ─────────────────────────────────────────────────────────────
const router = Router();

router.get('/mcp', (_req, res) => {
  res.status(405).json({ error: 'MCP endpoint: POST only (Streamable HTTP)' });
});
router.delete('/mcp', (_req, res) => {
  res.status(405).json({ error: 'Stateless mode: no sessions to terminate' });
});
router.post('/mcp', mcpAuth, async (req: Request, res: Response) => {
  // Stateless mode: a fresh transport per request.ponytail: no SSE streams /
  // session ids — every tool call is a single POST; add sessions only if a
  // client needs server-initiated notifications.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { void transport.close(); });
  try {
    await mcp.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: `Internal error: ${String(err)}` }, id: null });
    }
  }
});

export default router;
