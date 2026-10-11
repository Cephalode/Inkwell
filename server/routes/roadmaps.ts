import { Router, type Request, type Response } from 'express';
import pool from '../db.js';
import { callGLMJson } from '../src/llm.js';
import { collectMaterials, type MaterialUnit } from '../src/materials.js';
import { runGeneration, updateStatus, checkStale } from '../src/generationPipeline.js';
import { fetchCourseOutline } from '../src/coursera.js';
import { skillSlug, type Mastery } from '../src/mastery.js';

const router = Router();

// ponytail: E8 — every route here trusts the single user (no `user_id` scoping,
// single-user install). When multi-user lands, scope roadmaps/steps/activities
// by the authenticated user in this file AND server/routes/learning.ts.


// ── Row types ───────────────────────────────────────────────────────────────

interface RoadmapRow {
  id: string;
  course_id: string;
  title: string;
  overview: string;
  status: string;
  error: string | null;
  created_at: string;
  updated_at: string;
}

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
  skill_slug: string;
  skill_label: string;
  skill_description: string;
  mastery: Mastery;
  mastery_score: number;
  learned_at: string | null;
}

export interface SourceRef {
  documentId: string;
  chapterId?: string;
  title: string;
}

export type StepState = 'learned' | 'current' | 'available' | 'locked';

const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : String(x ?? ''))).filter(Boolean) : [];

// ── View builder (shared with the learning router) ──────────────────────────

/**
 * Full client view of a roadmap: ordered steps joined with their skill's
 * mastery, per-step activity summaries, which other courses teach the same
 * skill, each step's state (learned / current / available / locked) and the
 * recommended next step.
 */
export async function loadRoadmapView(roadmap: RoadmapRow) {
  const { rows: stepRows } = await pool.query(
    `SELECT s.*, k.slug AS skill_slug, k.label AS skill_label, k.description AS skill_description,
            k.mastery, k.mastery_score, k.learned_at
     FROM roadmap_steps s JOIN skills k ON k.id = s.skill_id
     WHERE s.roadmap_id = $1 ORDER BY s.position ASC`,
    [roadmap.id],
  );
  const steps = stepRows as StepRow[];
  const stepIds = steps.map((s) => s.id);
  const skillIds = steps.map((s) => s.skill_id);

  const { rows: actRows } = stepIds.length
    ? await pool.query(
        `SELECT id, step_id, kind, status, result, completed_at, created_at
         FROM learning_activities WHERE step_id = ANY($1) ORDER BY created_at DESC`,
        [stepIds],
      )
    : { rows: [] };
  const actsByStep = new Map<string, Array<Record<string, unknown>>>();
  for (const a of actRows) {
    const list = actsByStep.get(a.step_id) ?? [];
    list.push(a);
    actsByStep.set(a.step_id, list);
  }

  const { rows: alsoRows } = skillIds.length
    ? await pool.query(
        `SELECT s.skill_id, r.course_id, c.name AS course_name, s.id AS step_id
         FROM roadmap_steps s JOIN roadmaps r ON r.id = s.roadmap_id JOIN courses c ON c.id = r.course_id
         WHERE s.skill_id = ANY($1) AND r.id <> $2`,
        [skillIds, roadmap.id],
      )
    : { rows: [] };
  const alsoBySkill = new Map<string, Array<{ courseId: string; courseName: string; stepId: string }>>();
  for (const r of alsoRows) {
    const list = alsoBySkill.get(r.skill_id) ?? [];
    list.push({ courseId: r.course_id, courseName: r.course_name, stepId: r.step_id });
    alsoBySkill.set(r.skill_id, list);
  }

  const learnedIds = new Set(steps.filter((s) => s.mastery === 'learned').map((s) => s.id));
  let nextStepId: string | null = null;
  const view = steps.map((s) => {
    const dependsOn = strArr(s.depends_on).filter((id) => stepIds.includes(id));
    const locked = dependsOn.some((id) => !learnedIds.has(id));
    let state: StepState = s.mastery === 'learned' ? 'learned' : locked ? 'locked' : 'available';
    if (state === 'available' && !nextStepId) {
      nextStepId = s.id;
      state = 'current';
    }
    return {
      id: s.id,
      roadmapId: s.roadmap_id,
      skillId: s.skill_id,
      position: s.position,
      title: s.title,
      description: s.description,
      objectives: strArr(s.objectives),
      keyPoints: strArr(s.key_points),
      dependsOn,
      sourceRefs: (Array.isArray(s.source_refs) ? s.source_refs : []) as SourceRef[],
      estimatedMinutes: s.estimated_minutes,
      skill: {
        id: s.skill_id,
        slug: s.skill_slug,
        label: s.skill_label,
        description: s.skill_description,
        mastery: s.mastery,
        masteryScore: Number(s.mastery_score) || 0,
        learnedAt: s.learned_at,
      },
      state,
      activities: (actsByStep.get(s.id) ?? []).map((a) => ({
        id: a.id as string,
        kind: a.kind as string,
        status: a.status as string,
        score: typeof (a.result as { score?: number } | null)?.score === 'number' ? (a.result as { score: number }).score : null,
        completedAt: (a.completed_at as string | null) ?? null,
        createdAt: a.created_at as string,
      })),
      alsoIn: alsoBySkill.get(s.skill_id) ?? [],
    };
  });

  // If nothing is available (everything learned or locked by a cycle), fall
  // back to the first unlearned step so the learner always has a target.
  if (!nextStepId) {
    const first = view.find((s) => s.state !== 'learned');
    if (first) {
      nextStepId = first.id;
      first.state = 'current';
    }
  }

  const counts = {
    total: view.length,
    learned: view.filter((s) => s.state === 'learned').length,
    learning: view.filter((s) => s.skill.mastery === 'learning').length,
    locked: view.filter((s) => s.state === 'locked').length,
  };

  return {
    id: roadmap.id,
    courseId: roadmap.course_id,
    title: roadmap.title,
    overview: roadmap.overview,
    status: roadmap.status,
    error: roadmap.error,
    createdAt: roadmap.created_at,
    updatedAt: roadmap.updated_at,
    steps: view,
    nextStepId,
    counts,
  };
}

async function findRoadmap(where: 'id' | 'course_id', value: string): Promise<RoadmapRow | null> {
  const { rows } = await pool.query(`SELECT * FROM roadmaps WHERE ${where} = $1 ORDER BY is_active DESC, created_at DESC LIMIT 1`, [value]);
  if (rows.length === 0) return null;
  const row = rows[0] as RoadmapRow;
  if (row.status === 'generating' && checkStale(row)) {
    await updateStatus('roadmaps', row.id, 'error', 'Generation timed out');
    row.status = 'error';
    row.error = 'Generation timed out';
  }
  return row;
}

// ── GET /courses/:courseId/roadmap — the ACTIVE roadmap for a course ────────

router.get('/courses/:courseId/roadmap', async (req: Request, res: Response) => {
  try {
    const roadmap = await findRoadmap('course_id', String(req.params.courseId));
    if (!roadmap) return res.status(404).json({ error: 'No roadmap for this course yet' });
    const list = await listRoadmaps(String(req.params.courseId));
    res.json({ ...await loadRoadmapView(roadmap), versions: list });
  } catch (err) {
    console.error('Error loading roadmap:', err);
    res.status(500).json({ error: 'Failed to load roadmap' });
  }
});

// ── GET /courses/:courseId/roadmaps — version list for the switcher ─────────

router.get('/courses/:courseId/roadmaps', async (req: Request, res: Response) => {
  try {
    res.json(await listRoadmaps(String(req.params.courseId)));
  } catch (err) {
    console.error('Error listing roadmaps:', err);
    res.status(500).json({ error: 'Failed to list roadmaps' });
  }
});

/** Lightweight summaries, active first, newest first — the switcher menu. */
async function listRoadmaps(courseId: string) {
  const { rows } = await pool.query(
    `SELECT id, title, status, is_active, created_at,
            (SELECT count(*) FROM roadmap_steps s WHERE s.roadmap_id = r.id)::int AS step_count
     FROM roadmaps r WHERE course_id = $1
     ORDER BY is_active DESC, created_at DESC`,
    [courseId],
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title || 'Untitled path',
    status: r.status,
    isActive: r.is_active,
    createdAt: r.created_at,
    stepCount: r.step_count,
  }));
}

// ── POST /courses/:courseId/roadmap — create a NEW roadmap version ──────────

router.post('/courses/:courseId/roadmap', async (req: Request, res: Response) => {
  try {
    const courseId = String(req.params.courseId);
    const { rows: courseRows } = await pool.query('SELECT id, name FROM courses WHERE id = $1', [courseId]);
    if (courseRows.length === 0) return res.status(404).json({ error: 'Course not found' });

    // One in-flight build per course. Any roadmap (old or new) still
    // generating blocks a new one; the 10-min stale window mirrors
    // GENERATION_TIMEOUT_MS so a crashed run doesn't lock the course forever.
    const { rows: busy } = await pool.query(
      `SELECT id FROM roadmaps
       WHERE course_id = $1 AND status = 'generating' AND updated_at >= now() - interval '10 minutes'`,
      [courseId],
    );
    if (busy.length > 0) return res.status(409).json({ error: 'This course already has a roadmap generating' });

    // New versions start inactive: the new build's first step doesn't yank the
    // learner off the path they're on. Activation happens on switch (or on
    // first-ever build, where there's nothing to preserve).
    const existing = await pool.query('SELECT count(*)::int AS n FROM roadmaps WHERE course_id = $1', [courseId]);
    const activateNow = existing.rows[0].n === 0;
    // Optional custom name from the create dialog; falls back to "<course> roadmap".
    const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 120) : '';
    const { rows } = await pool.query(
      `INSERT INTO roadmaps (course_id, title, status, is_active)
       VALUES ($1, $2, 'pending', $3) RETURNING *`,
      [courseId, title || `${courseRows[0].name} roadmap`, activateNow],
    );
    res.status(201).json(await loadRoadmapView(rows[0] as RoadmapRow));
  } catch (err) {
    console.error('Error creating roadmap:', err);
    res.status(500).json({ error: 'Failed to create roadmap' });
  }
});

// ── PUT /roadmaps/:id/active — switch the course's active roadmap ───────────

router.put('/roadmaps/:id/active', async (req: Request, res: Response) => {
  try {
    const { rows: target } = await pool.query('SELECT id, course_id, status FROM roadmaps WHERE id = $1', [req.params.id]);
    if (target.length === 0) return res.status(404).json({ error: 'Roadmap not found' });
    if (target[0].status === 'generating') return res.status(409).json({ error: 'That roadmap is still generating' });
    const courseId = target[0].course_id as string;
    await pool.query('UPDATE roadmaps SET is_active = false WHERE course_id = $1 AND is_active', [courseId]);
    await pool.query('UPDATE roadmaps SET is_active = true, updated_at = now() WHERE id = $1', [req.params.id]);
    const roadmap = await findRoadmap('id', String(req.params.id));
    res.json({ ...await loadRoadmapView(roadmap!), versions: await listRoadmaps(courseId) });
  } catch (err) {
    console.error('Error activating roadmap:', err);
    res.status(500).json({ error: 'Failed to switch roadmap' });
  }
});

// ── DELETE /roadmaps/:id — remove a saved path (active one auto-promotes) ───

router.delete('/roadmaps/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT is_active, course_id, status FROM roadmaps WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Roadmap not found' });
    if (rows[0].status === 'generating') return res.status(409).json({ error: 'That roadmap is still generating' });
    const { is_active: isActive, course_id: courseId } = rows[0];
    await pool.query('DELETE FROM roadmaps WHERE id = $1', [req.params.id]);
    if (isActive) {
      // Keep the course usable: promote the newest finished sibling, if any.
      await pool.query(
        `UPDATE roadmaps SET is_active = true WHERE id = (
           SELECT id FROM roadmaps WHERE course_id = $1 AND status = 'done'
           ORDER BY created_at DESC LIMIT 1)`,
        [courseId],
      );
    }
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting roadmap:', err);
    res.status(500).json({ error: 'Failed to delete roadmap' });
  }
});

// ── GET /roadmaps/:id ───────────────────────────────────────────────────────

router.get('/roadmaps/:id', async (req: Request, res: Response) => {
  try {
    const roadmap = await findRoadmap('id', String(req.params.id));
    if (!roadmap) return res.status(404).json({ error: 'Roadmap not found' });
    res.json(await loadRoadmapView(roadmap));
  } catch (err) {
    console.error('Error loading roadmap:', err);
    res.status(500).json({ error: 'Failed to load roadmap' });
  }
});

// ── PATCH /roadmaps/:id — rename a roadmap and/or move it to another course ──

router.patch('/roadmaps/:id', async (req: Request, res: Response) => {
  try {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 120) : '';
    const courseId = typeof req.body?.courseId === 'string' ? req.body.courseId : '';
    if (!title && !courseId) return res.status(400).json({ error: 'Nothing to update' });
    if (courseId) {
      const course = await pool.query('SELECT id FROM courses WHERE id = $1', [courseId]);
      if (course.rowCount === 0) return res.status(404).json({ error: 'Course not found' });
    }
    const { rows } = await pool.query(
      `UPDATE roadmaps SET
         title = COALESCE(NULLIF($1, ''), title),
         course_id = COALESCE(NULLIF($2, ''), course_id),
         updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [title, courseId, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Roadmap not found' });
    // Unique active-index: moving an ACTIVE roadmap into a course that already
    // has one would violate it — deactivate there first is destructive, so refuse.
    res.json({ ...await loadRoadmapView(rows[0]), versions: await listRoadmaps(rows[0].course_id) });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'That course already has an active roadmap — switch it first' });
    }
    console.error('Error updating roadmap:', err);
    res.status(500).json({ error: 'Failed to update roadmap' });
  }
});

// ── POST /roadmaps/:id/generate — SSE pipeline ──────────────────────────────
//
// MAP: every material unit in the course → the topics it teaches.
// REDUCE: all extracted topics (+ Coursera syllabus when linked, + the labels
// of skills that already exist so the same concept in two courses shares one
// skill) → an ordered, dependency-aware roadmap, persisted as steps.

interface ExtractedTopic {
  name: string;
  description: string;
  objectives: string[];
  keyPoints: string[];
  /** Index into the materials array. */
  source: number;
}

interface SynthStep {
  title: string;
  description: string;
  objectives: string[];
  keyPoints: string[];
  dependsOn: string[];
  sources: number[];
  estimatedMinutes: number;
}

router.post('/roadmaps/:id/generate', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { rows } = await pool.query('SELECT * FROM roadmaps WHERE id = $1', [id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Roadmap not found' });

  // Atomic claim: only one pipeline per roadmap. Double-click, second tab, or
  // a raced retry gets 409 instead of double GLM spend + interleaved writes.
  // Stale rows (>10 min in 'generating', keep in sync with
  // GENERATION_TIMEOUT_MS) re-qualify so a crashed run can be retried.
  const claim = await pool.query(
    `UPDATE roadmaps SET status = 'generating', error = NULL, updated_at = now()
     WHERE id = $1 AND (status <> 'generating' OR updated_at < now() - interval '10 minutes')`,
    [id],
  );
  if (claim.rowCount === 0) {
    return res.status(409).json({ error: 'This roadmap is already generating' });
  }
  const roadmap = rows[0] as RoadmapRow;
  // Optional regeneration instruction from the client's dialog textbox.
  const guidance = typeof req.body?.guidance === 'string' ? req.body.guidance.trim().slice(0, 4000) : '';
  // Optional @-referenced files (client dialog): unioned into the material set
  // on top of the course's own, so the path can be shaped by any file.
  const requestedIds: string[] = Array.isArray(req.body?.documentIds)
    ? req.body.documentIds.filter((x: unknown): x is string => typeof x === 'string')
    : [];
  let extraIds = '';
  if (requestedIds.length > 0) {
    const names = await pool.query('SELECT id, name FROM documents WHERE id = ANY($1)', [requestedIds]);
    extraIds = names.rows.map((r) => r.name).join(', ');
  }

  const { rows: courseRows } = await pool.query('SELECT name, coursera_slug FROM courses WHERE id = $1', [roadmap.course_id]);
  const courseName: string = courseRows[0]?.name ?? 'Course';
  const courseraSlug: string | null = courseRows[0]?.coursera_slug ?? null;

  const extracted: ExtractedTopic[] = [];
  let materials: MaterialUnit[] = [];
  let syllabusHint = '';

  await runGeneration({
    table: 'roadmaps',
    id,
    req,
    res,
    concurrency: 4, // ponytail: MAP calls are independent; 4 keeps GLM rate limits happy

    collectMaterials: async () => {
      if (courseraSlug) {
        const cauth = (await pool.query('SELECT cauth FROM coursera_account WHERE id = 1')).rows[0]?.cauth ?? null;
        if (cauth) {
          try {
            const outline = await fetchCourseOutline(cauth, courseraSlug);
            syllabusHint = outline
              .map((m) => `- ${m.name}${m.lessons.length ? `: ${m.lessons.map((l) => l.name).join('; ')}` : ''}`)
              .join('\n');
          } catch {
            // ponytail: no syllabus → materials-only roadmap
          }
        }
      }
      materials = await collectMaterials({ courseId: roadmap.course_id, documentIds: requestedIds });
      return materials;
    },

    processMaterial: async (unit) => {
      const index = materials.indexOf(unit);
      const out = await callGLMJson<{ topics?: unknown }>(
        [
          {
            role: 'system',
            content:
              'You are a curriculum designer breaking course material into teachable topics. Extract only what the material actually teaches; skip logistics, biography, and promotional content.',
          },
          {
            role: 'user',
            content: `Material title: ${unit.title}

Text:
${unit.text}

List the distinct topics this material teaches — up to 8 for short materials, up to 15 for long ones that cover many videos/chapters. For each give a short name (2-6 words, the concept itself, e.g. "Gradient descent", not "Introduction to..."), a one-sentence description, 2-4 learning objectives (what the learner should be able to do), and 3-5 key points a lesson must cover.

Respond with ONLY JSON: {"topics": [{"name": "...", "description": "...", "objectives": ["..."], "keyPoints": ["..."]}]}`,
          },
        ],
        { temperature: 0.3, maxTokens: 3000 },
      );
      const topics = Array.isArray(out?.topics) ? (out!.topics as Array<Record<string, unknown>>) : [];
      let n = 0;
      for (const t of topics) {
        if (!t || typeof t.name !== 'string' || !t.name.trim()) continue;
        extracted.push({
          name: t.name.trim(),
          description: typeof t.description === 'string' ? t.description : '',
          objectives: strArr(t.objectives),
          keyPoints: strArr(t.keyPoints),
          source: index,
        });
        n++;
      }
      return n;
    },

    finalize: async (_items, emit) => {
      if (extracted.length === 0) throw new Error('No topics could be extracted from the course materials');

      const { rows: skillRows } = await pool.query(
        'SELECT label, mastery FROM skills ORDER BY updated_at DESC LIMIT 200',
      );
      const known = (skillRows as Array<{ label: string; mastery: string }>).filter((s) => s.mastery === 'learned');
      const knownSlugs = new Set(known.map((s) => skillSlug(s.label)));
      // Already-mastered skills are dropped outright — switching courses must
      // not make the learner sit through topics they've already proven. Steps
      // that teach them are pruned below (their deps re-point to real steps).
      const knownLine = known.length
        ? `\nSkills the learner has ALREADY mastered (never build a step for these; a step that only covers one of them should be dropped, and if most of a step is old material, refine the step to cover just what's new):\n${known.map((s) => `- ${s.label}`).join('\n')}\n`
        : '';
      const existing = (skillRows as Array<{ label: string; mastery: string }>)
        .filter((s) => s.mastery !== 'learned')
        .map((s) => `- ${s.label}`)
        .join('\n');

      const synth = await callGLMJson<{ title?: string; overview?: string; steps?: unknown }>(
        [
          {
            role: 'system',
            content:
              'You are an expert instructional designer building a learning roadmap: an ordered path of topics where each step builds on earlier ones.',
          },
          {
            role: 'user',
            content: `Course: ${courseName}

Topics extracted from every material in the course (index = material number):
${JSON.stringify(extracted.map((t, i) => ({ i, ...t })))}
${syllabusHint ? `\nThe course's official syllabus (modules and lessons), in order:\n${syllabusHint}\nFollow the syllabus order and ONLY include topics the syllabus teaches.\n` : ''}${existing ? `\nSkills that already exist in the learner's library but are NOT yet mastered. If a roadmap step is the SAME concept as one of these, use that EXACT label as the step title so progress carries over:\n${existing}\n` : ''}${knownLine}${guidance ? `\nThe learner's request for THIS path: ${guidance}\nShape the path around this request wherever the course materials support it.\n` : ''}${extraIds ? `\nThe learner explicitly referenced these documents for this path: ${extraIds}. Work their content in.\n` : ''}
Build the roadmap:
- Merge duplicate/overlapping extracted topics into one step each. Aim for 6-16 steps; never more than 20.
- Order from foundations to advanced. Each step lists the titles of earlier steps it depends on (empty for foundations). No cycles.
- Each step: title (2-6 words, the concept), description (1-2 sentences), 3-5 objectives, 4-7 keyPoints merged from the sources, sources = the extracted-topic indices it merges, estimatedMinutes (10-45).
- MATH NOTATION (titles, descriptions, objectives, keyPoints): write math in clean Unicode, NEVER ASCII spell-outs — Greek as characters (μ, σ, Σ — never "mu", "sigma"), subscripts as Unicode (xᵢ, Cₖ, μₖ), superscripts as Unicode (², ⁿ, ᵗ⁺¹), norms as ‖xᵢ − μₖ‖², ops as ≤ ≥ ≠ →. No LaTeX, no ^ or _ markers.

Respond with ONLY JSON: {"title": "...", "overview": "3-4 sentence overview of the path", "steps": [{"title": "...", "description": "...", "objectives": ["..."], "keyPoints": ["..."], "dependsOn": ["earlier step title"], "sources": [0, 3], "estimatedMinutes": 20}]}`,
          },
        ],
        { temperature: 0.4, maxTokens: 8192 },
      );

      const rawSteps = Array.isArray(synth?.steps) ? (synth!.steps as Array<Record<string, unknown>>) : [];
      let steps: SynthStep[] = rawSteps
        .filter((s) => s && typeof s.title === 'string' && s.title.trim())
        .map((s) => ({
          title: String(s.title).trim(),
          description: typeof s.description === 'string' ? s.description : '',
          objectives: strArr(s.objectives),
          keyPoints: strArr(s.keyPoints),
          dependsOn: strArr(s.dependsOn),
          sources: Array.isArray(s.sources) ? s.sources.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < extracted.length) : [],
          estimatedMinutes: Math.max(5, Math.min(90, Number(s.estimatedMinutes) || 15)),
        }))
        .slice(0, 20);

      // Fallback: the synthesis failed — use the extracted topics as-is.
      if (steps.length === 0) {
        const seen = new Set<string>();
        steps = extracted
          .filter((t) => {
            const k = skillSlug(t.name);
            if (!k || seen.has(k)) return false;
            seen.add(k);
            return true;
          })
          .slice(0, 20)
          .map((t) => ({
            title: t.name,
            description: t.description,
            objectives: t.objectives,
            keyPoints: t.keyPoints,
            dependsOn: [],
            sources: [t.source],
            estimatedMinutes: 15,
          }));
      }

      // Dedupe by slug (UNIQUE(roadmap_id, skill_id)); merge duplicates' data.
      const bySlug = new Map<string, SynthStep>();
      for (const s of steps) {
        const k = skillSlug(s.title);
        if (!k) continue;
        const prev = bySlug.get(k);
        if (!prev) bySlug.set(k, s);
        else {
          prev.objectives = [...new Set([...prev.objectives, ...s.objectives])];
          prev.keyPoints = [...new Set([...prev.keyPoints, ...s.keyPoints])];
          prev.sources = [...new Set([...prev.sources, ...s.sources])];
          prev.dependsOn = [...new Set([...prev.dependsOn, ...s.dependsOn])];
        }
      }
      const finalSteps = [...bySlug.values()]
        // Don't reteach: a step whose skill is already mastered is dropped for
        // good. The LLM was told to skip these; this is the guarantee when it
        // doesn't (label drift, merged steps, etc.).
        .filter((s) => !knownSlugs.has(skillSlug(s.title)));
      if (finalSteps.length === 0) {
        throw new Error('Every topic in this course is already mastered — no steps needed. Add new material or reset a skill to rebuild.');
      }

      // Persist atomically: replace steps, upsert skills.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM roadmap_steps WHERE roadmap_id = $1', [id]);

        const stepIdByTitle = new Map<string, string>();
        const inserted: Array<{ id: string; dependsOn: string[] }> = [];
        for (let i = 0; i < finalSteps.length; i++) {
          const s = finalSteps[i];
          const slug = skillSlug(s.title);
          const { rows: sk } = await client.query(
            `INSERT INTO skills (slug, label, description)
             VALUES ($1, $2, $3)
             ON CONFLICT (slug) DO UPDATE SET
               description = CASE WHEN skills.description = '' THEN EXCLUDED.description ELSE skills.description END,
               updated_at = now()
             RETURNING id`,
            [slug, s.title, s.description],
          );
          const skillId = sk[0].id as string;
          const sourceRefs: SourceRef[] = [];
          const seenRef = new Set<string>();
          for (const idx of s.sources) {
            const unit = materials[extracted[idx]?.source ?? -1];
            if (!unit) continue;
            const key = `${unit.documentId}|${unit.chapterId ?? ''}`;
            if (seenRef.has(key)) continue;
            seenRef.add(key);
            sourceRefs.push({ documentId: unit.documentId, chapterId: unit.chapterId, title: unit.title });
          }
          const { rows: st } = await client.query(
            `INSERT INTO roadmap_steps (roadmap_id, skill_id, position, title, description, objectives, key_points, source_refs, estimated_minutes)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9)
             RETURNING id`,
            [id, skillId, i, s.title, s.description, JSON.stringify(s.objectives), JSON.stringify(s.keyPoints), JSON.stringify(sourceRefs), s.estimatedMinutes],
          );
          const stepId = st[0].id as string;
          stepIdByTitle.set(slug, stepId);
          inserted.push({ id: stepId, dependsOn: s.dependsOn });
        }

        // Resolve dependsOn titles → step ids (only earlier steps, to keep it acyclic).
        for (let i = 0; i < inserted.length; i++) {
          const deps = inserted[i].dependsOn
            .map((t) => stepIdByTitle.get(skillSlug(t)))
            .filter((d): d is string => !!d && d !== inserted[i].id)
            .filter((d) => inserted.findIndex((x) => x.id === d) < i);
          await client.query('UPDATE roadmap_steps SET depends_on = $1::jsonb WHERE id = $2', [
            JSON.stringify([...new Set(deps)]),
            inserted[i].id,
          ]);
        }

        await client.query(
          'UPDATE roadmaps SET title = $1, overview = $2, updated_at = now() WHERE id = $3',
          [
            (typeof synth?.title === 'string' && synth.title.trim()) || `${courseName} roadmap`,
            typeof synth?.overview === 'string' ? synth.overview : '',
            id,
          ],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      const fresh = (await pool.query('SELECT * FROM roadmaps WHERE id = $1', [id])).rows[0] as RoadmapRow;
      emit('roadmap', { roadmap: await loadRoadmapView({ ...fresh, status: 'done' }) });
    },
  });
});

export default router;
