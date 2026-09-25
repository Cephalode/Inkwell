// Learn mode (E6 / PRD 3) — Duolingo-style guided lessons per document.
// Pipeline: one GLM outline call → per-section generation (sequential; GLM
// rate limits) → lesson flips to 'ready' when every section resolves
// (done OR failed — a failed section retries individually, never poisons).
import { Router } from 'express';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import db from '../db';
import { callGLMJson, callGLM } from '../src/llm';

const router = Router();

interface OutlineSection {
  type: 'intro' | 'teaching' | 'quiz';
  title: string;
}

// ── Pipeline (fire-and-forget, status lives in the DB) ──────────────────────

async function setLessonError(id: string, errMsg: string): Promise<void> {
  try {
    await db.query("UPDATE lessons SET status = 'error', error = $2, updated_at = now() WHERE id = $1", [id, errMsg.slice(0, 500)]);
  } catch { /* best effort */ }
}

async function generateSection(lessonId: string, sectionId: string, doc: { title: string; excerpt: string }, outline: OutlineSection): Promise<void> {
  try {
    let content: unknown;
    if (outline.type === 'quiz') {
      const res = await callGLMJson<{ questions: Array<{ qtype: string; prompt: string; options?: string[]; correct_answer: string | boolean; explanation: string; hint?: string }> }>(
        [
          {
            role: 'user',
            content: `Generate 3-5 checkpoint quiz questions (mix mcq / true_false / short_answer) from this material, on the topic "${outline.title}".

Material:
${doc.excerpt.slice(0, 6000)}

For MCQ: 4 options, correct_answer = exact text of the correct option. For true/false: boolean. Include a one-sentence hint per question.
Respond with JSON: {"questions": [{"qtype": "...", "prompt": "...", "options": [...], "correct_answer": ..., "explanation": "...", "hint": "..."}]}`,
          },
        ],
        { maxTokens: 2500 },
      );
      content = { questions: res?.questions || [] };
    } else {
      const markdown = await callGLM(
        [
          {
            role: 'user',
            content: `You are a patient tutor writing section "${outline.title}" (${outline.type}) of a guided lesson on "${doc.title}".

Material:
${doc.excerpt}

Write 300-600 words of markdown teaching prose: short paragraphs, bold key terms, one worked example or analogy. ${outline.type === 'intro' ? 'This is the opening section — hook the student and preview the lesson.' : 'Teach the topic of this section thoroughly, grounded in the material — no invented facts.'} Respond with ONLY the markdown.`,
          },
        ],
        { maxTokens: 2000 },
      );
      content = { markdown: markdown || '' };
    }
    await db.query(
      "UPDATE lesson_sections SET content = $1, generation_status = 'complete' WHERE id = $2",
      [JSON.stringify(content), sectionId],
    );
  } catch (err: unknown) {
    await db.query(
      "UPDATE lesson_sections SET generation_status = 'failed', content = $1 WHERE id = $2",
      [JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), sectionId],
    );
  }

  // Section resolved (done or failed) — flip lesson to ready when none pending.
  const { rows } = await db.query(
    "SELECT count(*)::int AS pending FROM lesson_sections WHERE lesson_id = $1 AND generation_status = 'pending'",
    [lessonId],
  );
  if ((rows[0] as { pending: number }).pending === 0) {
    await db.query("UPDATE lessons SET status = 'ready', updated_at = now() WHERE id = $1 AND status = 'generating'", [lessonId]);
  }
}

/** Fire-and-forget full lesson generation. */
function startLessonGeneration(lessonId: string, documentId: string): void {
  void (async () => {
    try {
      const { rows } = await db.query('SELECT name, summary, parsed_text FROM documents WHERE id = $1', [documentId]);
      const docRow = rows[0] as { name: string; summary: string | null; parsed_text: string | null } | undefined;
      if (!docRow) throw new Error('Document not found');
      const excerpt = (docRow.parsed_text || docRow.summary || '').slice(0, 12000);
      if (excerpt.trim().length < 200) throw new Error('Document has too little text to build a lesson from');

      const outline = await callGLMJson<{ sections: OutlineSection[] }>(
        [
          {
            role: 'user',
            content: `Plan a guided lesson on "${docRow.name}" — 5-9 sections: one intro, 3-7 teaching sections covering the material in order, one final quiz section.

Material:
${excerpt}

Respond with JSON: {"sections": [{"type": "intro|teaching|quiz", "title": "..."}]}`,
          },
        ],
        { maxTokens: 1500 },
      );

      const sections = (outline?.sections || [])
        .filter((s) => s && typeof s.title === 'string' && s.title.trim() && ['intro', 'teaching', 'quiz'].includes(s.type))
        .slice(0, 9);
      if (sections.length < 2) throw new Error('Outline generation returned too few sections');

      for (let i = 0; i < sections.length; i++) {
        await db.query(
          `INSERT INTO lesson_sections (id, lesson_id, idx, kind, title) VALUES ($1, $2, $3, $4, $5)`,
          [randomUUID(), lessonId, i, sections[i].type, sections[i].title.trim().slice(0, 120)],
        );
      }
      await db.query("UPDATE lessons SET status = 'generating', updated_at = now() WHERE id = $1", [lessonId]);

      // Sequential — one GLM call at a time (rate limits).
      const { rows: sectionRows } = await db.query(
        'SELECT id, kind, title FROM lesson_sections WHERE lesson_id = $1 ORDER BY idx ASC',
        [lessonId],
      );
      for (const row of sectionRows as Array<{ id: string; kind: string; title: string }>) {
        await generateSection(lessonId, row.id, { title: docRow.name, excerpt }, { type: row.kind as OutlineSection['type'], title: row.title });
      }
    } catch (err: unknown) {
      console.error('Lesson generation failed:', err);
      await setLessonError(lessonId, err instanceof Error ? err.message : String(err));
    }
  })();
}

// ── Routes ──────────────────────────────────────────────────────────────────

// GET /api/lessons — list
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT l.*, d.name AS document_name FROM lessons l
       LEFT JOIN documents d ON d.id = l.document_id
       ORDER BY l.updated_at DESC`,
    );
    res.json(rows);
  } catch (err) {
    console.error('Error listing lessons:', err);
    res.status(500).json({ error: 'Failed to list lessons' });
  }
});

// POST /api/lessons — create from a document {documentId, title?}
router.post('/', async (req: Request, res: Response) => {
  try {
    const documentId = String(req.body.documentId || '');
    if (!documentId) return res.status(400).json({ error: 'documentId required' });
    const doc = await db.query('SELECT name FROM documents WHERE id = $1', [documentId]);
    if (doc.rows.length === 0) return res.status(404).json({ error: 'Document not found' });

    const id = randomUUID();
    const title = String(req.body.title || `Learn: ${(doc.rows[0] as { name: string }).name}`).slice(0, 120);
    await db.query(
      `INSERT INTO lessons (id, document_id, title, status) VALUES ($1, $2, $3, 'pending')`,
      [id, documentId, title],
    );
    startLessonGeneration(id, documentId);
    res.status(201).json({ id, title, status: 'pending' });
  } catch (err) {
    console.error('Error creating lesson:', err);
    res.status(500).json({ error: 'Failed to create lesson' });
  }
});

// GET /api/lessons/:id — lesson + sections
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const lesson = await db.query('SELECT * FROM lessons WHERE id = $1', [id]);
    if (lesson.rows.length === 0) return res.status(404).json({ error: 'Lesson not found' });
    const sections = await db.query(
      'SELECT id, idx, kind, title, content, generation_status FROM lesson_sections WHERE lesson_id = $1 ORDER BY idx ASC',
      [id],
    );
    res.json({ ...lesson.rows[0], sections: sections.rows });
  } catch (err) {
    console.error('Error fetching lesson:', err);
    res.status(500).json({ error: 'Failed to fetch lesson' });
  }
});

// POST /api/lessons/:id/sections/:sectionId/retry — regenerate one failed section
router.post('/:id/sections/:sectionId/retry', async (req: Request, res: Response) => {
  try {
    const { id, sectionId } = { id: String(req.params.id), sectionId: String(req.params.sectionId) };
    const lesson = await db.query('SELECT document_id FROM lessons WHERE id = $1', [id]);
    const section = await db.query('SELECT idx, kind, title FROM lesson_sections WHERE id = $1 AND lesson_id = $2', [sectionId, id]);
    if (lesson.rows.length === 0 || section.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    await db.query("UPDATE lesson_sections SET generation_status = 'pending', content = NULL WHERE id = $1", [sectionId]);
    await db.query("UPDATE lessons SET status = 'generating', error = NULL, updated_at = now() WHERE id = $1", [id]);

    const docRow = (await db.query('SELECT name, parsed_text, summary FROM documents WHERE id = $1', [(lesson.rows[0] as { document_id: string }).document_id])).rows[0] as { name: string; parsed_text: string | null; summary: string | null };
    const s = section.rows[0] as { kind: string; title: string };
    void generateSection(id, sectionId, { title: docRow.name, excerpt: (docRow.parsed_text || docRow.summary || '').slice(0, 12000) }, { type: s.kind as OutlineSection['type'], title: s.title });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error retrying section:', err);
    res.status(500).json({ error: 'Failed to retry section' });
  }
});

// POST /api/lessons/:id/progress — {completedIdx: number} mark section done
router.post('/:id/progress', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const completedIdx = Number(req.body.completedIdx);
    if (!Number.isInteger(completedIdx)) return res.status(400).json({ error: 'completedIdx required' });

    const lesson = await db.query('SELECT progress FROM lessons WHERE id = $1', [id]);
    if (lesson.rows.length === 0) return res.status(404).json({ error: 'Lesson not found' });
    const progress = (lesson.rows[0] as { progress: { completed?: number[] } | null })?.progress || { completed: [] };
    const completed = Array.from(new Set([...(progress.completed || []), completedIdx]));

    const total = await db.query('SELECT count(*)::int AS n FROM lesson_sections WHERE lesson_id = $1', [id]);
    const percent = total.rows.length ? Math.round((completed.length / (total.rows[0] as { n: number }).n) * 100) : 0;

    await db.query('UPDATE lessons SET progress = $1, percent_completed = $2, updated_at = now() WHERE id = $3', [
      JSON.stringify({ completed }), percent, id,
    ]);
    res.json({ percent, completed });
  } catch (err) {
    console.error('Error updating progress:', err);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

// DELETE /api/lessons/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await db.query('DELETE FROM lessons WHERE id = $1', [String(req.params.id)]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting lesson:', err);
    res.status(500).json({ error: 'Failed to delete lesson' });
  }
});

export default router;
