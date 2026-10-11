import { Router, type Request, type Response } from 'express';
import pool from '../db.js';
import { storageDownload } from '../src/storage.js';
import { loadRoadmapView, type SourceRef } from './roadmaps.js';
import {
  awardXp,
  getProfile,
  recordEvidence,
  recomputeSkill,
  XP_BY_KIND,
  type EvidenceKind,
  type Mastery,
} from '../src/mastery.js';
import {
  buildDiagram,
  buildFlashcards,
  buildFlowLesson,
  buildFlowQuiz,
  buildLesson,
  buildPodcast,
  buildQuiz,
  buildRecall,
  buildSlides,
  continueDiscussion,
  gradeDiagram,
  gradeQuiz,
  gradeRecall,
  groundingText,
  openDiscussion,
  reviewDiagram,
  synthesizePodcastAudio,
  synthesizeSlidesAudio,
  type DiagramContent,
  type DiscussionAssessment,
  type DiscussionContent,
  type FlashcardsContent,
  type FlowLessonContent,
  type FlowQuizContent,
  type LessonContent,
  type PodcastContent,
  type QuizContent,
  type RecallContent,
  type SlidesContent,
  type StepContext,
} from '../src/tutor.js';

const router = Router();

type ActivityKind = 'lesson' | 'quiz' | 'flashcards' | 'discussion' | 'recall' | 'podcast' | 'diagram' | 'slides' | 'flow';
const KINDS: ReadonlySet<string> = new Set(['lesson', 'quiz', 'flashcards', 'discussion', 'recall', 'podcast', 'diagram', 'slides', 'flow']);

// ── Learning flow (Duolingo-style) ──────────────────────────────────────────
// kind='flow' + slot ∈ {learn1, review1, review_prev, learn2, review2, review1b, test}.
// The slot decides what gets generated; the 7-slot sequence itself lives in the
// client (FlowLesson.tsx) since it's pure presentation order.

type FlowSlot = 'learn1' | 'review1' | 'review_prev' | 'learn2' | 'review2' | 'review1b' | 'test';

interface FlowAttempt { subject: string; correct: boolean }

/** Per-subject right/wrong from every completed flow activity on this step. */
function flowAttempts(stepActivities: ActivityRow[]): FlowAttempt[] {
  const attempts: FlowAttempt[] = [];
  for (const a of stepActivities) {
    if (a.kind !== 'flow' || a.status !== 'completed' || !a.result) continue;
    const r = a.result as { attempts?: FlowAttempt[] };
    if (Array.isArray(r.attempts)) attempts.push(...r.attempts);
  }
  return attempts;
}

/** Weak subjects (any miss, most-missed first) + solid subjects (all right). */
function flowSubjectStats(attempts: FlowAttempt[]): { focus: string[]; sprinkle: string[]; taught: string[] } {
  const tally = new Map<string, { right: number; wrong: number }>();
  for (const a of attempts) {
    const t = tally.get(a.subject) ?? { right: 0, wrong: 0 };
    if (a.correct) t.right++; else t.wrong++;
    tally.set(a.subject, t);
  }
  const focus: string[] = [];
  const sprinkle: string[] = [];
  for (const [subject, t] of tally) (t.wrong > 0 ? focus : sprinkle).push(subject);
  focus.sort((a, b) => (tally.get(b)!.wrong - tally.get(a)!.wrong));
  return { focus, sprinkle, taught: [...tally.keys()] };
}

/** Generate the content for a flow activity, per its slot. */
async function buildFlowContent(slot: FlowSlot, step: StepRow, ctx: StepContext, grounding: string, activities: ActivityRow[]): Promise<FlowLessonContent | FlowQuizContent> {
  const learn = (opts: { maxSubjects?: number; exclude?: string[] }) => buildFlowLesson(ctx, grounding, opts);
  switch (slot) {
    case 'learn1':
      // First half of the topic's subjects.
      return learn({ maxSubjects: 4 });
    case 'learn2': {
      // Second half: exclude everything the first lesson taught.
      const taught = flowSubjectStats(flowAttempts(activities)).taught;
      return learn({ maxSubjects: 4, exclude: taught });
    }
    case 'review1':
    case 'review1b': {
      // Quizzed on the FIRST learn lesson's subjects only.
      const first = activities.find((a) => a.kind === 'flow' && (a.result as { slot?: string } | null)?.slot === 'learn1' && a.status === 'completed');
      const subjects = first ? flowSubjectStats(flowAttempts([first])).taught : [];
      if (subjects.length === 0) return buildFlowQuiz(ctx, grounding, { count: 6, focus: [], sprinkle: [] }); // learn not done yet — general quiz
      return buildFlowQuiz(ctx, grounding, { count: Math.min(8, subjects.length * 2), focus: subjects, sprinkle: [] });
    }
    case 'review2': {
      // Second-half subjects only.
      const second = activities.find((a) => a.kind === 'flow' && (a.result as { slot?: string } | null)?.slot === 'learn2' && a.status === 'completed');
      const subjects = second ? flowSubjectStats(flowAttempts([second])).taught : [];
      if (subjects.length === 0) return buildFlowQuiz(ctx, grounding, { count: 6, focus: [], sprinkle: [] });
      return buildFlowQuiz(ctx, grounding, { count: Math.min(8, subjects.length * 2), focus: subjects, sprinkle: [] });
    }
    case 'review_prev': {
      // Everything from EARLIER topics of the roadmap (completed steps before this one).
      const { rows } = await pool.query(
        `SELECT a.result FROM learning_activities a
         JOIN roadmap_steps s ON s.id = a.step_id
         WHERE s.roadmap_id = $1 AND s.position < $2 AND a.kind = 'flow' AND a.status = 'completed'`,
        [step.roadmap_id, step.position],
      );
      const attempts = (rows as Array<{ result: unknown }>).flatMap((r) =>
        r.result && Array.isArray((r.result as { attempts?: FlowAttempt[] }).attempts) ? (r.result as { attempts: FlowAttempt[] }).attempts : [],
      );
      const { focus, sprinkle } = flowSubjectStats(attempts);
      if (focus.length + sprinkle.length === 0) {
        // First topic of the roadmap (or nothing recorded): brief all-coverage quiz.
        return buildFlowQuiz(ctx, grounding, { count: 5, focus: [], sprinkle: [] });
      }
      // Weakest previous subjects first, one keeps-fresh question each, cap 8.
      return buildFlowQuiz(ctx, grounding, { count: Math.min(8, Math.max(focus.length, 3) + sprinkle.length), focus: focus.slice(0, 4), sprinkle: sprinkle.slice(0, 4) });
    }
    case 'test': {
      // Everything on this topic, misses weighted hardest.
      const { focus, sprinkle } = flowSubjectStats(flowAttempts(activities));
      const total = Math.min(12, Math.max(8, focus.length * 2 + sprinkle.length));
      return buildFlowQuiz(ctx, grounding, { count: total, focus, sprinkle });
    }
  }
}

const FLOW_SLOTS: ReadonlySet<string> = new Set(['learn1', 'review1', 'review_prev', 'learn2', 'review2', 'review1b', 'test']);

/** XP bonus for a strong assessment result / for a skill becoming learned. */
const XP_PASS_BONUS = 10;
const XP_LEARNED_BONUS = 25;

interface StepRow {
  id: string;
  roadmap_id: string;
  skill_id: string;
  position: number;
  title: string;
  description: string;
  objectives: unknown;
  key_points: unknown;
  depends_on: unknown;
  source_refs: unknown;
  estimated_minutes: number;
  course_id: string;
  course_name: string;
}

interface ActivityRow {
  id: string;
  step_id: string;
  kind: ActivityKind;
  status: string;
  content: unknown;
  result: unknown;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : String(x ?? ''))).filter(Boolean) : [];

// ── Helpers ─────────────────────────────────────────────────────────────────

async function loadStep(stepId: string): Promise<StepRow | null> {
  const { rows } = await pool.query(
    `SELECT s.*, r.course_id, c.name AS course_name
     FROM roadmap_steps s JOIN roadmaps r ON r.id = s.roadmap_id JOIN courses c ON c.id = r.course_id
     WHERE s.id = $1`,
    [stepId],
  );
  return rows.length ? (rows[0] as StepRow) : null;
}

function stepContext(step: StepRow): StepContext {
  return {
    courseName: step.course_name,
    title: step.title,
    description: step.description,
    objectives: strArr(step.objectives),
    keyPoints: strArr(step.key_points),
    sourceRefs: (Array.isArray(step.source_refs) ? step.source_refs : []) as SourceRef[],
  };
}

async function loadSkill(skillId: string) {
  const { rows } = await pool.query('SELECT * FROM skills WHERE id = $1', [skillId]);
  const s = rows[0];
  if (!s) return null;
  return {
    id: s.id as string,
    slug: s.slug as string,
    label: s.label as string,
    description: s.description as string,
    mastery: s.mastery as Mastery,
    masteryScore: Number(s.mastery_score) || 0,
    learnedAt: (s.learned_at as string | null) ?? null,
  };
}

/** Client shape of an activity. Quiz answers stay hidden until it's completed. */
function toClientActivity(a: ActivityRow) {
  let content = a.content as Record<string, unknown> | null;
  if (a.kind === 'quiz' && content && a.status !== 'completed') {
    const quiz = content as unknown as QuizContent;
    content = {
      ...quiz,
      questions: quiz.questions.map((q) => ({
        id: q.id,
        qtype: q.qtype,
        prompt: q.prompt,
        options: q.options,
        objective: q.objective,
      })),
    };
  }
  const result = a.result as { score?: number } | null;
  return {
    id: a.id,
    stepId: a.step_id,
    kind: a.kind,
    status: a.status,
    content,
    result: a.result ?? null,
    score: typeof result?.score === 'number' ? result.score : null,
    error: a.error,
    startedAt: a.started_at,
    completedAt: a.completed_at,
    createdAt: a.created_at,
  };
}

async function loadActivity(id: string): Promise<ActivityRow | null> {
  const { rows } = await pool.query('SELECT * FROM learning_activities WHERE id = $1', [id]);
  return rows.length ? (rows[0] as ActivityRow) : null;
}

/**
 * Close an activity: persist its result, record evidence on the skill, award
 * XP, and report whether the skill just flipped to `learned`.
 */
async function completeActivity(
  activity: ActivityRow,
  step: StepRow,
  result: Record<string, unknown> & { score: number },
  evidence: { kind: EvidenceKind; weight: number; note: string },
) {
  const { rows } = await pool.query(
    `UPDATE learning_activities
     SET status = 'completed', result = $1::jsonb, completed_at = now(), updated_at = now()
     WHERE id = $2 RETURNING *`,
    [JSON.stringify(result), activity.id],
  );
  const updated = rows[0] as ActivityRow;

  const m = await recordEvidence(step.skill_id, {
    kind: evidence.kind,
    score: result.score,
    weight: evidence.weight,
    note: evidence.note,
    activityId: activity.id,
    courseId: step.course_id,
  });
  const justLearned = m.previous !== 'learned' && m.mastery === 'learned';

  let xpGained = XP_BY_KIND[evidence.kind] ?? 0;
  if ((evidence.kind === 'quiz' || evidence.kind === 'recall' || evidence.kind === 'discussion') && result.score >= 0.8) {
    xpGained += XP_PASS_BONUS;
  }
  if (justLearned) xpGained += XP_LEARNED_BONUS;
  const profile = await awardXp(xpGained);

  return {
    activity: toClientActivity(updated),
    skill: await loadSkill(step.skill_id),
    previousMastery: m.previous,
    justLearned,
    xpGained,
    profile,
  };
}

// ── GET /roadmap-steps/:stepId ──────────────────────────────────────────────

router.get('/roadmap-steps/:stepId', async (req: Request, res: Response) => {
  try {
    const step = await loadStep(String(req.params.stepId));
    if (!step) return res.status(404).json({ error: 'Step not found' });

    const { rows: rm } = await pool.query('SELECT * FROM roadmaps WHERE id = $1', [step.roadmap_id]);
    const view = await loadRoadmapView(rm[0]);
    const idx = view.steps.findIndex((s) => s.id === step.id);
    const base = view.steps[idx];

    const { rows: actRows } = await pool.query(
      'SELECT * FROM learning_activities WHERE step_id = $1 ORDER BY created_at DESC',
      [step.id],
    );
    const { rows: evRows } = await pool.query(
      `SELECT e.id, e.kind, e.score, e.weight, e.note, e.created_at, e.course_id, c.name AS course_name
       FROM skill_evidence e LEFT JOIN courses c ON c.id = e.course_id
       WHERE e.skill_id = $1 ORDER BY e.created_at DESC LIMIT 30`,
      [step.skill_id],
    );

    res.json({
      ...base,
      courseId: step.course_id,
      courseName: step.course_name,
      roadmapNextStepId: view.nextStepId,
      prevStepId: idx > 0 ? view.steps[idx - 1].id : null,
      nextStepId: idx >= 0 && idx < view.steps.length - 1 ? view.steps[idx + 1].id : null,
      dependsOnTitles: base.dependsOn.map((d) => view.steps.find((s) => s.id === d)?.title ?? '').filter(Boolean),
      activities: (actRows as ActivityRow[]).map(toClientActivity),
      evidence: evRows.map((e) => ({
        id: e.id,
        kind: e.kind,
        score: Number(e.score),
        weight: Number(e.weight),
        note: e.note,
        createdAt: e.created_at,
        courseId: e.course_id,
        courseName: e.course_name,
      })),
    });
  } catch (err) {
    console.error('Error loading step:', err);
    res.status(500).json({ error: 'Failed to load step' });
  }
});

// ── POST /roadmap-steps/:stepId/activities — start a learning strategy ──────

router.post('/roadmap-steps/:stepId/activities', async (req: Request, res: Response) => {
  try {
    const kind = String((req.body as { kind?: string }).kind ?? '');
    if (!KINDS.has(kind)) return res.status(400).json({ error: `kind must be one of ${[...KINDS].join(', ')}` });
    const step = await loadStep(String(req.params.stepId));
    if (!step) return res.status(404).json({ error: 'Step not found' });

    // Flow activities carry their slot in the request; it drives generation
    // and is stamped onto the result at submit time (review slots read it).
    let flowSlot: FlowSlot | null = null;
    if (kind === 'flow') {
      const slot = String((req.body as { slot?: string }).slot ?? '');
      if (!FLOW_SLOTS.has(slot)) return res.status(400).json({ error: `slot must be one of ${[...FLOW_SLOTS].join(', ')}` });
      flowSlot = slot as FlowSlot;
    }

    // Insert the row NOW and return it: a cold GLM generation runs 1-4 min —
    // past Cloudflare's 100 s proxy cap, which 524s the tunnel and the UI
    // reports failure while the server finishes anyway. The client polls
    // GET /learning-activities/:id until content lands.
    const { rows } = await pool.query(
      `INSERT INTO learning_activities (step_id, kind, status, started_at)
       VALUES ($1, $2, 'in_progress', now()) RETURNING *`,
      [step.id, kind],
    );
    const activityId = (rows[0] as ActivityRow).id;
    res.status(201).json(toClientActivity(rows[0] as ActivityRow));

    void (async () => {
      try {
        const ctx = stepContext(step);
        const grounding = await groundingText(ctx);

        let content: LessonContent | QuizContent | FlashcardsContent | DiscussionContent | RecallContent | PodcastContent | DiagramContent | SlidesContent | FlowLessonContent | FlowQuizContent;
        switch (kind as ActivityKind) {
          case 'flow': {
            // The slot picks what to build: learn → subjects deck, review/test → quiz.
            const existing = await pool.query('SELECT * FROM learning_activities WHERE step_id = $1 ORDER BY created_at ASC', [step.id]);
            content = await buildFlowContent(flowSlot!, step, ctx, grounding, existing.rows as ActivityRow[]);
            // Stamp the slot into the content so a resumed activity knows
            // which lesson it is without needing the request body again.
            (content as { slot?: FlowSlot }).slot = flowSlot!;
            break;
          }
          case 'lesson':
            content = await buildLesson(ctx, grounding);
            break;
          case 'quiz': {
            const quiz = await buildQuiz(ctx, grounding);
            if (quiz.questions.length === 0) throw new Error('The tutor could not write questions for this topic — try again');
            content = quiz;
            break;
          }
          case 'flashcards': {
            const cards = await buildFlashcards(ctx, grounding);
            if (cards.cards.length === 0) throw new Error('The tutor could not write cards for this topic — try again');
            content = cards;
            break;
          }
          case 'discussion':
            content = await openDiscussion(ctx, grounding);
            break;
          case 'recall':
            content = await buildRecall(ctx, grounding);
            break;
          case 'podcast':
            content = await buildPodcast(ctx, grounding);
            break;
          case 'diagram':
            content = await buildDiagram(ctx, grounding);
            break;
          case 'slides':
            content = await buildSlides(ctx, grounding);
            break;
          default:
            throw new Error('Unsupported kind');
        }

        // Status stays 'in_progress' (the UI's resumable state) until submission
        // completes it — content presence is what unlocks the tile/runner.
        await pool.query(
          `UPDATE learning_activities SET content = $1::jsonb, updated_at = now() WHERE id = $2`,
          [JSON.stringify(content), activityId],
        );

        if (kind === 'podcast') {
          // ponytail: TTS render runs fire-and-forget (1-4 min) — script returns
          // now so the request clears Cloudflare's proxy cap; the runner polls
          // the activity until audioPath (or renderError) lands in content.
          const attach = (patch: object) =>
            pool.query(
              "UPDATE learning_activities SET content = content || $1::jsonb, updated_at = now() WHERE id = $2 AND status <> 'completed'",
              [JSON.stringify(patch), activityId],
            );
          void synthesizePodcastAudio(activityId, content as PodcastContent)
            .then((audioPath) => attach({ audioPath }))
            .catch((err: unknown) => {
              console.error('Podcast TTS render failed:', err);
              return attach({ renderError: err instanceof Error ? err.message : String(err) });
            });
        }

        if (kind === 'slides') {
          // Same pattern as podcasts: narration renders fire-and-forget (1-4
          // min of TTS); the runner polls the activity until audioPath (or
          // renderError) lands in content.
          const attach = (patch: object) =>
            pool.query(
              "UPDATE learning_activities SET content = content || $1::jsonb, updated_at = now() WHERE id = $2 AND status <> 'completed'",
              [JSON.stringify(patch), activityId],
            );
          void synthesizeSlidesAudio(activityId, content as SlidesContent)
            .then(({ audioPath, slideAudio }) => attach({ audioPath, slideAudio }))
            .catch((err: unknown) => {
              console.error('Slides TTS render failed:', err);
              return attach({ renderError: err instanceof Error ? err.message : String(err) });
            });
        }
      } catch (err) {
        console.error('Error generating activity:', err);
        await pool.query(
          `UPDATE learning_activities SET status = 'error', error = $1, updated_at = now() WHERE id = $2`,
          [(err instanceof Error ? err.message : String(err)).slice(0, 500), activityId],
        ).catch(() => {});
      }
    })();
  } catch (err) {
    console.error('Error creating activity:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create activity' });
  }
});

// ── GET /learning-activities/:id ────────────────────────────────────────────

router.get('/learning-activities/:id', async (req: Request, res: Response) => {
  try {
    const a = await loadActivity(String(req.params.id));
    if (!a) return res.status(404).json({ error: 'Activity not found' });
    res.json(toClientActivity(a));
  } catch (err) {
    console.error('Error loading activity:', err);
    res.status(500).json({ error: 'Failed to load activity' });
  }
});

// ── DELETE /learning-activities/:id — abandon an unfinished activity ────────

router.delete('/learning-activities/:id', async (req: Request, res: Response) => {
  try {
    await pool.query("DELETE FROM learning_activities WHERE id = $1 AND status <> 'completed'", [String(req.params.id)]);
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting activity:', err);
    res.status(500).json({ error: 'Failed to delete activity' });
  }
});

// ── GET /learning-activities/:id/audio — stream podcast/slides narration ────

router.get('/learning-activities/:id/audio', async (req: Request, res: Response) => {
  try {
    const a = await loadActivity(String(req.params.id));
    if (!a || (a.kind !== 'podcast' && a.kind !== 'slides')) return res.status(404).json({ error: 'Activity not found' });
    const path = (a.content as PodcastContent | SlidesContent | null)?.audioPath;
    if (!path) return res.status(404).json({ error: 'Audio not ready yet' });
    const buf = await storageDownload(path);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Accept-Ranges', 'none'); // ponytail: no range support, same as document podcasts
    res.setHeader('Cache-Control', 'public, max-age=86400'); // ponytail: audio bytes immutable per key
    res.end(buf);
  } catch (err) {
    console.error('Error streaming podcast audio:', err);
    res.status(500).json({ error: 'Failed to stream podcast audio' });
  }
});

// ── POST /learning-activities/:id/submit — finish & grade ───────────────────

router.post('/learning-activities/:id/submit', async (req: Request, res: Response) => {
  try {
    const a = await loadActivity(String(req.params.id));
    if (!a) return res.status(404).json({ error: 'Activity not found' });
    if (a.status === 'completed') return res.status(409).json({ error: 'Activity already completed' });
    const step = await loadStep(a.step_id);
    if (!step) return res.status(404).json({ error: 'Step not found' });
    const body = (req.body ?? {}) as Record<string, unknown>;

    switch (a.kind) {
      case 'flow': {
        // Duolingo-style: the client already graded each MCQ instantly (the
        // payload carries {slot, attempts:[{subject,correct}], hintsUsed}).
        // Score = share right; slot decides evidence strength — the test
        // closes the topic, reviews keep it warm, learns just open it.
        const content = a.content as FlowLessonContent | FlowQuizContent | null;
        if (!content) return res.status(409).json({ error: 'This lesson has no content yet' });
        const slot = String((body as { slot?: string }).slot ?? '') as FlowSlot;
        const attempts = (Array.isArray((body as { attempts?: unknown }).attempts) ? (body as { attempts: Array<{ subject?: unknown; correct?: unknown }> }).attempts : [])
          .map((x) => ({ subject: String(x.subject ?? ''), correct: x.correct === true }))
          .filter((x) => x.subject);
        if (attempts.length === 0) return res.status(400).json({ error: 'attempts are required' });
        const hintsUsed = Math.max(0, Math.min(99, Number((body as { hintsUsed?: unknown }).hintsUsed ?? 0)));
        const correct = attempts.filter((x) => x.correct).length;
        const score = correct / attempts.length;
        const evidence: { kind: EvidenceKind; weight: number; note: string } =
          slot === 'test'
            ? { kind: 'quiz', weight: 1.2, note: `Flow test ${Math.round(score * 100)}% (${correct}/${attempts.length})` }
            : slot.startsWith('review')
              ? { kind: 'quiz', weight: 0.8, note: `Flow review ${Math.round(score * 100)}% (${correct}/${attempts.length})` }
              : { kind: 'lesson', weight: 0.4, note: `Flow lesson ${Math.round(score * 100)}% (${correct}/${attempts.length})` };
        return res.json(
          await completeActivity(a, step, { score, passed: score >= 0.8, correct, total: attempts.length, slot, attempts, hintsUsed }, evidence),
        );
      }
      case 'quiz': {
        const quiz = a.content as QuizContent;
        const answers = (body.answers ?? {}) as Record<string, string | boolean | undefined>;
        const { graded, score } = await gradeQuiz(quiz, answers);
        const passed = score >= quiz.passScore;
        return res.json(
          await completeActivity(a, step, { score, passed, graded }, {
            kind: 'quiz',
            weight: 1,
            note: `Quiz ${Math.round(score * 100)}% (${graded.filter((g) => g.isCorrect).length}/${graded.length})`,
          }),
        );
      }
      case 'flashcards': {
        const deck = a.content as FlashcardsContent;
        const grades = (body.grades ?? {}) as Record<string, boolean>;
        const total = deck.cards.length || 1;
        const correct = deck.cards.filter((c) => grades[c.id] === true).length;
        const score = correct / total;
        return res.json(
          await completeActivity(a, step, { score, correct, total }, {
            kind: 'flashcards',
            weight: 0.6,
            note: `Flashcards ${correct}/${total} got it`,
          }),
        );
      }
      case 'lesson': {
        const lesson = a.content as LessonContent;
        const total = lesson.checkpoints.length;
        const checkpointsCorrect = Math.max(0, Math.min(total, Number(body.checkpointsCorrect ?? total)));
        // Reading is weak evidence: it opens a topic but never closes it.
        const score = total > 0 ? 0.4 + 0.3 * (checkpointsCorrect / total) : 0.5;
        return res.json(
          await completeActivity(a, step, { score, checkpointsCorrect, total }, {
            kind: 'lesson',
            weight: 0.4,
            note: 'Lesson read',
          }),
        );
      }
      case 'recall': {
        const recall = a.content as RecallContent;
        const answer = String(body.answer ?? '').trim();
        if (!answer) return res.status(400).json({ error: 'answer is required' });
        if (!recall.rubric?.length) {
          return res.status(409).json({ error: 'This teach-back has no rubric — restart the activity to regenerate one.' });
        }
        const grade = await gradeRecall(stepContext(step), recall, answer);
        return res.json(
          await completeActivity(a, step, { ...grade, answer }, {
            kind: 'recall',
            weight: 1.2,
            note: `Teach-back ${Math.round(grade.score * 100)}%`,
          }),
        );
      }
      case 'discussion': {
        const content = a.content as DiscussionContent;
        const last = [...content.messages].reverse().find((m) => m.assessment)?.assessment;
        const assessment: DiscussionAssessment = last ?? {
          verdict: 'progressing',
          confidence: 0.3,
          coveredObjectives: [],
          gaps: [],
        };
        return res.json(await closeDiscussion(a, step, { ...content, closed: true }, assessment));
      }
      case 'podcast': {
        // Listening is weak evidence, like reading: fixed score, XP only.
        return res.json(
          await completeActivity(a, step, { score: 0.5 }, {
            kind: 'podcast',
            weight: 0.4,
            note: 'Podcast listened',
          }),
        );
      }
      case 'slides': {
        // Viewing a deck (with or without narration) is weak evidence, like
        // reading a lesson or listening to a podcast: fixed score, XP only.
        return res.json(
          await completeActivity(a, step, { score: 0.5 }, {
            kind: 'slides',
            weight: 0.4,
            note: 'Slides viewed',
          }),
        );
      }
      case 'diagram': {
        // Normal path: the review loop graded the final canvas (image passed
        // with the last turn). Direct submit grades whatever is on it now.
        const imageDataUrl = String((body as { image?: string }).image ?? '');
        if (!imageDataUrl.startsWith('data:image/')) {
          return res.status(400).json({ error: 'image (data URL) is required — export your canvas first' });
        }
        const grade = await gradeDiagram(stepContext(step), a.content as DiagramContent, imageDataUrl);
        return res.json(
          await completeActivity(a, step, { ...grade, image: imageDataUrl }, {
            kind: 'diagram',
            weight: 1.2,
            note: `Diagram ${Math.round(grade.score * 100)}%`,
          }),
        );
      }
      default:
        return res.status(400).json({ error: 'Unsupported kind' });
    }
  } catch (err) {
    console.error('Error submitting activity:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to submit activity' });
  }
});

function discussionScore(a: DiscussionAssessment): number {
  if (a.verdict === 'learned') return Math.max(0.8, a.confidence);
  if (a.verdict === 'struggling') return Math.min(0.3, a.confidence);
  return Math.max(0.3, Math.min(0.75, a.confidence));
}

async function closeDiscussion(a: ActivityRow, step: StepRow, content: DiscussionContent, assessment: DiscussionAssessment) {
  await pool.query('UPDATE learning_activities SET content = $1::jsonb, updated_at = now() WHERE id = $2', [
    JSON.stringify(content),
    a.id,
  ]);
  const score = discussionScore(assessment);
  return completeActivity(
    a,
    step,
    { score, ...assessment, turns: content.messages.filter((m) => m.role === 'user').length },
    { kind: 'discussion', weight: 1.5, note: `Tutor: ${assessment.verdict} (${Math.round(assessment.confidence * 100)}%)` },
  );
}

// ── POST /learning-activities/:id/messages — one discussion turn ────────────

router.post('/learning-activities/:id/messages', async (req: Request, res: Response) => {
  try {
    const a = await loadActivity(String(req.params.id));
    if (!a) return res.status(404).json({ error: 'Activity not found' });
    if (a.kind !== 'discussion') return res.status(400).json({ error: 'Not a discussion' });
    if (a.status === 'completed') return res.status(409).json({ error: 'Discussion already closed' });
    const text = String((req.body as { content?: string }).content ?? '').trim();
    if (!text) return res.status(400).json({ error: 'content is required' });
    const step = await loadStep(a.step_id);
    if (!step) return res.status(404).json({ error: 'Step not found' });

    const ctx = stepContext(step);
    const grounding = await groundingText(ctx);
    const turn = await continueDiscussion(ctx, grounding, a.content as DiscussionContent, text);

    if (turn.done) {
      const closed = await closeDiscussion(a, step, turn.content, turn.assessment);
      return res.json({ ...closed, assessment: turn.assessment, done: true });
    }

    const { rows } = await pool.query(
      'UPDATE learning_activities SET content = $1::jsonb, updated_at = now() WHERE id = $2 RETURNING *',
      [JSON.stringify(turn.content), a.id],
    );
    res.json({ activity: toClientActivity(rows[0] as ActivityRow), assessment: turn.assessment, done: false });
  } catch (err) {
    console.error('Error in discussion turn:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to continue discussion' });
  }
});

// ── POST /learning-activities/:id/diagram — one vision review round ─────────

router.post('/learning-activities/:id/diagram', async (req: Request, res: Response) => {
  try {
    const a = await loadActivity(String(req.params.id));
    if (!a) return res.status(404).json({ error: 'Activity not found' });
    if (a.kind !== 'diagram') return res.status(400).json({ error: 'Not a diagram activity' });
    if (a.status === 'completed') return res.status(409).json({ error: 'Diagram already graded' });
    const image = String((req.body as { image?: string }).image ?? '');
    if (!image.startsWith('data:image/')) return res.status(400).json({ error: 'image (data URL) is required' });
    const step = await loadStep(a.step_id);
    if (!step) return res.status(404).json({ error: 'Step not found' });

    const ctx = stepContext(step);
    const content = a.content as DiagramContent;
    const review = await reviewDiagram(ctx, content, image);
    const done = review.verdict === 'done';

    content.messages.push(
      { role: 'user', content: `(submitted diagram snapshot, round ${content.messages.length + 1})`, at: new Date().toISOString() },
      { role: 'assistant', content: review.feedback, at: new Date().toISOString() },
    );
    await pool.query('UPDATE learning_activities SET content = $1::jsonb, updated_at = now() WHERE id = $2', [
      JSON.stringify(content),
      a.id,
    ]);
    if (done) {
      const grade = await gradeDiagram(ctx, content, image);
      const closed = await completeActivity(a, step, { ...grade, image }, {
        kind: 'diagram',
        weight: 1.2,
        note: `Diagram ${Math.round(grade.score * 100)}%`,
      });
      return res.json({ ...closed, review, done: true });
    }
    const { rows } = await pool.query(
      'UPDATE learning_activities SET content = $1::jsonb, updated_at = now() WHERE id = $2 RETURNING *',
      [JSON.stringify(content), a.id],
    );
    res.json({ activity: toClientActivity(rows[0] as ActivityRow), review, done: false });
  } catch (err) {
    console.error('Error reviewing diagram:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to review diagram' });
  }
});

// ── Skills ──────────────────────────────────────────────────────────────────

router.get('/skills', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT k.*,
              COALESCE(json_agg(json_build_object('courseId', r.course_id, 'courseName', c.name, 'stepId', s.id, 'roadmapId', r.id, 'position', s.position)
                       ORDER BY r.course_id) FILTER (WHERE s.id IS NOT NULL), '[]') AS courses
       FROM skills k
       LEFT JOIN roadmap_steps s ON s.skill_id = k.id
       LEFT JOIN roadmaps r ON r.id = s.roadmap_id
       LEFT JOIN courses c ON c.id = r.course_id
       GROUP BY k.id ORDER BY k.label ASC`,
    );
    res.json(
      rows.map((s) => ({
        id: s.id,
        slug: s.slug,
        label: s.label,
        description: s.description,
        mastery: s.mastery,
        masteryScore: Number(s.mastery_score) || 0,
        learnedAt: s.learned_at,
        courses: s.courses,
      })),
    );
  } catch (err) {
    console.error('Error listing skills:', err);
    res.status(500).json({ error: 'Failed to list skills' });
  }
});

// Manual override: "I already know this" / "reset my progress".
router.post('/skills/:id/mastery', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const mastery = String((req.body as { mastery?: string }).mastery ?? '');
    if (mastery !== 'learned' && mastery !== 'not_started') {
      return res.status(400).json({ error: "mastery must be 'learned' or 'not_started'" });
    }
    const existing = await loadSkill(id);
    if (!existing) return res.status(404).json({ error: 'Skill not found' });

    if (mastery === 'not_started') {
      // A reset wipes the trail so future evidence starts clean.
      await pool.query('DELETE FROM skill_evidence WHERE skill_id = $1', [id]);
      await recomputeSkill(id);
    } else {
      await recordEvidence(id, { kind: 'manual', score: 1, weight: 1, note: 'Marked as already known' });
    }
    res.json(await loadSkill(id));
  } catch (err) {
    console.error('Error updating skill mastery:', err);
    res.status(500).json({ error: 'Failed to update mastery' });
  }
});

// ── GET /learning/overview — the Learn page + dashboard feed ────────────────

// ── PATCH /learning/profile — set the daily XP goal (PRD-13) ────────────────
// learner_profile.daily_goal_xp had no setter anywhere (web only displays it).
// Clamped 10–1000; upsert mirrors awardXp so the single row is self-healing.

router.patch('/learning/profile', async (req: Request, res: Response) => {
  try {
    const raw = req.body?.dailyGoalXp;
    const goal = Number(raw);
    if (!Number.isFinite(goal)) return res.status(400).json({ error: 'dailyGoalXp required' });
    const clamped = Math.round(Math.min(1000, Math.max(10, goal)));
    await pool.query(
      `INSERT INTO learner_profile (id, daily_goal_xp) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET daily_goal_xp = $1`,
      [clamped],
    );
    res.json({ profile: await getProfile() });
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.get('/learning/overview', async (_req: Request, res: Response) => {
  try {
    const profile = await getProfile();
    const { rows: courseRows } = await pool.query(
      `SELECT c.id, c.name, c.is_current, r.id AS roadmap_id, r.status
       FROM courses c LEFT JOIN roadmaps r ON r.course_id = c.id AND r.is_active
       ORDER BY c.is_current DESC, c.updated_at DESC`,
    );
    const courses = [];
    for (const c of courseRows) {
      if (!c.roadmap_id) {
        courses.push({ courseId: c.id, courseName: c.name, isCurrent: !!c.is_current, roadmapId: null, status: null, total: 0, learned: 0, learning: 0, nextStep: null });
        continue;
      }
      const { rows: rm } = await pool.query('SELECT * FROM roadmaps WHERE id = $1', [c.roadmap_id]);
      const view = await loadRoadmapView(rm[0]);
      const next = view.steps.find((s) => s.id === view.nextStepId) ?? null;
      courses.push({
        courseId: c.id,
        courseName: c.name,
        isCurrent: !!c.is_current,
        roadmapId: c.roadmap_id,
        status: c.status,
        total: view.counts.total,
        learned: view.counts.learned,
        learning: view.counts.learning,
        nextStep: next ? { id: next.id, title: next.title, estimatedMinutes: next.estimatedMinutes } : null,
      });
    }

    const { rows: counts } = await pool.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE mastery = 'learned')::int AS learned,
              count(*) FILTER (WHERE mastery = 'learning')::int AS learning
       FROM skills`,
    );
    const { rows: recent } = await pool.query(
      `SELECT id, slug, label, description, mastery, mastery_score, learned_at
       FROM skills WHERE mastery = 'learned' ORDER BY learned_at DESC NULLS LAST LIMIT 6`,
    );
    // Review suggestions: learned a while ago, oldest first — spaced repetition lite.
    const { rows: review } = await pool.query(
      `SELECT k.id, k.slug, k.label, k.description, k.mastery, k.mastery_score, k.learned_at,
              (SELECT s.id FROM roadmap_steps s WHERE s.skill_id = k.id ORDER BY s.created_at LIMIT 1) AS step_id,
              (SELECT c.name FROM roadmap_steps s JOIN roadmaps r ON r.id = s.roadmap_id JOIN courses c ON c.id = r.course_id
               WHERE s.skill_id = k.id ORDER BY s.created_at LIMIT 1) AS course_name
       FROM skills k
       WHERE k.mastery = 'learned' AND k.learned_at < now() - interval '5 days'
       ORDER BY k.learned_at ASC LIMIT 5`,
    );
    const { rows: activityRows } = await pool.query(
      `SELECT count(*)::int AS completed,
              count(*) FILTER (WHERE completed_at >= date_trunc('day', now()))::int AS completed_today
       FROM learning_activities WHERE status = 'completed'`,
    );

    const toSkill = (s: Record<string, unknown>) => ({
      id: s.id,
      slug: s.slug,
      label: s.label,
      description: s.description,
      mastery: s.mastery,
      masteryScore: Number(s.mastery_score) || 0,
      learnedAt: s.learned_at,
    });

    res.json({
      profile,
      courses,
      skillsTotal: counts[0].total,
      skillsLearned: counts[0].learned,
      skillsLearning: counts[0].learning,
      activitiesCompleted: activityRows[0].completed,
      activitiesCompletedToday: activityRows[0].completed_today,
      recentlyLearned: recent.map(toSkill),
      reviewSuggestions: review.map((r) => ({ skill: toSkill(r), stepId: r.step_id, courseName: r.course_name })),
    });
  } catch (err) {
    console.error('Error loading learning overview:', err);
    res.status(500).json({ error: 'Failed to load learning overview' });
  }
});

// ── GET /learning/document-usage — which roadmap milestones each document feeds ─

router.get('/learning/document-usage', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.id AS step_id, s.title AS step_title, s.source_refs, r.course_id, c.name AS course_name, k.mastery
       FROM roadmap_steps s
       JOIN roadmaps r ON r.id = s.roadmap_id
       JOIN courses c ON c.id = r.course_id
       JOIN skills k ON k.id = s.skill_id`,
    );
    const usage: Record<string, Array<{ stepId: string; stepTitle: string; courseId: string; courseName: string; mastery: string }>> = {};
    for (const row of rows) {
      const refs = (Array.isArray(row.source_refs) ? row.source_refs : []) as Array<{ documentId?: string }>;
      const seen = new Set<string>();
      for (const ref of refs) {
        if (!ref?.documentId || seen.has(ref.documentId)) continue;
        seen.add(ref.documentId);
        (usage[ref.documentId] ??= []).push({
          stepId: row.step_id,
          stepTitle: row.step_title,
          courseId: row.course_id,
          courseName: row.course_name,
          mastery: row.mastery,
        });
      }
    }
    res.json(usage);
  } catch (err) {
    console.error('Error loading document usage:', err);
    res.status(500).json({ error: 'Failed to load document usage' });
  }
});

export default router;
