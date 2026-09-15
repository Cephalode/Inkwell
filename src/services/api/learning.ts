import type {
  DiscussionTurnResponse,
  LearningActivity,
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

/** Create the course's roadmap row (or reset an existing one to pending). */
export async function createCourseRoadmap(courseId: string): Promise<Roadmap> {
  return json<Roadmap>(await post(`${API_BASE}/courses/${courseId}/roadmap`), 'Failed to create roadmap');
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
export async function generateRoadmap(id: string, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(`${API_BASE}/roadmaps/${id}/generate`, {
    method: 'POST',
    headers: { Accept: 'text/event-stream' },
    signal,
  });
  if (!res.ok) throw new Error(await readError(res, `Failed to start roadmap generation (${res.status})`));
  return res;
}

export async function deleteRoadmap(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/roadmaps/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(`Failed to delete roadmap: ${res.status}`);
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
): Promise<LearningActivity> {
  return json<LearningActivity>(
    await post(`${API_BASE}/roadmap-steps/${stepId}/activities`, { kind }, signal),
    'Failed to start activity',
  );
}

export async function getActivity(id: string): Promise<LearningActivity> {
  return json<LearningActivity>(await fetch(`${API_BASE}/learning-activities/${id}`), 'Failed to load activity');
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
  | Record<string, never>; // discussion (close early)

export async function submitActivity(id: string, payload: SubmitPayload): Promise<SubmitResponse> {
  return json<SubmitResponse>(await post(`${API_BASE}/learning-activities/${id}/submit`, payload), 'Failed to submit');
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
