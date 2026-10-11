import type {
  DiscussionTurnResponse,
  FlowSlot,
  LearningActivity,
  LearningMode,
  LearningOverview,
  Roadmap,
  Skill,
  SkillWithCourses,
  StepDetail,
  SubmitResponse,
} from '../../types/learning';

const API_BASE: string = typeof window !== 'undefined' ? `${window.location.origin}/api` : '/api';

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error || fallback;
  } catch {
    return fallback;
  }
}

async function json<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) throw new Error(await readError(res, `${fallback} (${res.status})`));
  return (await res.json()) as T;
}

const post = (url: string, body?: unknown, signal?: AbortSignal) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

// ── Roadmaps ────────────────────────────────────────────────────────────────

/** The course's roadmap, or `null` when none has been created yet. */
export async function getCourseRoadmap(courseId: string): Promise<Roadmap | null> {
  const res = await fetch(`${API_BASE}/courses/${courseId}/roadmap`);
  if (res.status === 404) return null;
  return json<Roadmap>(res, 'Failed to load roadmap');
}

/** Rename a roadmap and/or move it to another course. */
export async function updateRoadmap(id: string, updates: { title?: string; courseId?: string }): Promise<Roadmap> {
  const res = await fetch(`${API_BASE}/roadmaps/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return json<Roadmap>(res, 'Failed to update roadmap');
}

/** Create a NEW roadmap version for the course (old versions are kept). */
export async function createCourseRoadmap(courseId: string, title?: string): Promise<Roadmap> {
  const body = title?.trim() ? { title: title.trim() } : {};
  return json<Roadmap>(await post(`${API_BASE}/courses/${courseId}/roadmap`, body), 'Failed to create roadmap');
}

/** Switch which of the course's roadmap versions is active. */
export async function activateRoadmap(id: string): Promise<Roadmap> {
  return json<Roadmap>(
    await fetch(`${API_BASE}/roadmaps/${id}/active`, { method: 'PUT' }),
    'Failed to switch roadmap',
  );
}

/** Delete an inactive roadmap version. */
export async function deleteRoadmap(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/roadmaps/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await readError(res, 'Failed to delete roadmap'));
}

export async function getRoadmap(id: string): Promise<Roadmap> {
  return json<Roadmap>(await fetch(`${API_BASE}/roadmaps/${id}`), 'Failed to load roadmap');
}

/**
 * Start roadmap generation. Returns the raw SSE `Response`; consume it with
 * `consumeSSE`. Events: the shared pipeline set (`materials_collected`,
 * `material_start`, `material_result`, `synthesizing`, `done`, `error`) plus
 * a `roadmap` event carrying the finished roadmap view.
 */
export async function generateRoadmap(id: string, signal?: AbortSignal, guidance?: string, documentIds?: string[]): Promise<Response> {
  const res = await fetch(`${API_BASE}/roadmaps/${id}/generate`, {
    method: 'POST',
    headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(guidance?.trim() ? { guidance } : {}),
      ...(documentIds?.length ? { documentIds } : {}),
    }),
    signal,
  });
  if (!res.ok) throw new Error(await readError(res, `Failed to start roadmap generation (${res.status})`));
  return res;
}

// ── Steps & activities ──────────────────────────────────────────────────────

export async function getStep(stepId: string): Promise<StepDetail> {
  return json<StepDetail>(await fetch(`${API_BASE}/roadmap-steps/${stepId}`), 'Failed to load step');
}

/** Generate a fresh activity of the given kind for a step (one LLM call; can take 10-30s). */
export async function startActivity(
  stepId: string,
  kind: LearningActivity['kind'],
  signal?: AbortSignal,
  slot?: FlowSlot,
): Promise<LearningActivity> {
  const created = await json<LearningActivity>(
    await post(`${API_BASE}/roadmap-steps/${stepId}/activities`, slot ? { kind, slot } : { kind }, signal),
    'Failed to start activity',
  );
  // The server returns the row immediately and generates content in the
  // background (a cold generation outlives Cloudflare's 100 s proxy cap).
  // Keep the "resolves when ready" contract by polling until content lands.
  let current = created;
  let misses = 0;
  // 200 × 3s ≈ 10 min: slides decks are the heaviest generation (SVG-laden
  // JSON, 3-6 min, double that when GLM retries) — the old 5-min cap showed
  // "Generation timed out" while the server was still working. Error rows
  // surface immediately via the status check below, so slow failure feedback
  // isn't affected.
  for (let i = 0; i < 200 && !current.content && current.status !== 'error'; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      current = await getActivity(current.id);
      misses = 0;
    } catch {
      // ponytail: transient blips (laptop sleep, tunnel hiccup) must not kill
      // a 3-min poll; 10 consecutive misses (~20 s of downtime) give up.
      if (++misses >= 10) throw new Error('Lost contact with the server while generating');
    }
  }
  if (current.status === 'error') throw new Error(current.error ?? 'Generation failed');
  if (!current.content) throw new Error('Generation timed out — try again');
  return current;
}

export async function getActivity(id: string): Promise<LearningActivity> {
  // Bounded: the podcast poll retries on failure, but a hung fetch (server
  // restart) would otherwise freeze the "Rendering audio…" loop forever.
  return json<LearningActivity>(
    await fetch(`${API_BASE}/learning-activities/${id}`, { signal: AbortSignal.timeout(10_000) }),
    'Failed to load activity',
  );
}

export async function abandonActivity(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/learning-activities/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(`Failed to abandon activity: ${res.status}`);
}

export type SubmitPayload =
  | { answers: Record<string, string | boolean> } // quiz
  | { grades: Record<string, boolean> } // flashcards
  | { checkpointsCorrect?: number } // lesson
  | { answer: string } // recall
  | { image: string } // diagram (final canvas snapshot)
  | { slot: FlowSlot; attempts: Array<{ subject: string; correct: boolean }>; hintsUsed?: number } // flow (client-graded MCQs)
  | Record<string, never>; // discussion (close early) · podcast (done listening)

export async function submitActivity(id: string, payload: SubmitPayload): Promise<SubmitResponse> {
  return json<SubmitResponse>(await post(`${API_BASE}/learning-activities/${id}/submit`, payload), 'Failed to submit');
}

/** The account's teaching style: legacy strategies or the guided flow. */
export async function getLearningMode(): Promise<LearningMode> {
  const r = await json<{ mode: LearningMode }>(await fetch(`${API_BASE}/auth/learning-mode`), 'Failed to load learning mode');
  return r.mode === 'flow' ? 'flow' : 'legacy';
}

export async function setLearningMode(mode: LearningMode): Promise<LearningMode> {
  const r = await json<{ mode: LearningMode }>(
    await fetch(`${API_BASE}/auth/learning-mode`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    }),
    'Failed to save learning mode',
  );
  return r.mode === 'flow' ? 'flow' : 'legacy';
}

/** One diagram review round: the tutor looks at the canvas snapshot. */
export async function submitDiagramReview(
  id: string,
  image: string,
): Promise<Partial<SubmitResponse> & { activity: LearningActivity; review: { verdict: 'add' | 'done'; feedback: string; covered: string[]; missing: string[] }; done: boolean }> {
  return json(
    await post(`${API_BASE}/learning-activities/${id}/diagram`, { image }),
    'Failed to review your diagram',
  );
}

export async function sendDiscussionMessage(id: string, content: string): Promise<DiscussionTurnResponse> {
  return json<DiscussionTurnResponse>(
    await post(`${API_BASE}/learning-activities/${id}/messages`, { content }),
    'Failed to send message',
  );
}

// ── Skills & overview ───────────────────────────────────────────────────────

export async function listSkills(): Promise<SkillWithCourses[]> {
  return json<SkillWithCourses[]>(await fetch(`${API_BASE}/skills`), 'Failed to list skills');
}

export async function setSkillMastery(skillId: string, mastery: 'learned' | 'not_started'): Promise<Skill> {
  return json<Skill>(await post(`${API_BASE}/skills/${skillId}/mastery`, { mastery }), 'Failed to update mastery');
}

export async function getLearningOverview(): Promise<LearningOverview> {
  return json<LearningOverview>(await fetch(`${API_BASE}/learning/overview`), 'Failed to load learning overview');
}
