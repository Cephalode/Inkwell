import type {
  DocumentUsage,
  SkillVideos,
  VideoDetail,
  VideoPlan,
  WatchQuizQuestion,
  WatchedResponse,
} from '../../types/videos';

const API_BASE: string = typeof window !== 'undefined' ? `${window.location.origin}/api` : '/api';

async function json<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    let msg = `${fallback} (${res.status})`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* keep fallback */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

const post = (url: string, body?: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

export async function getSkillVideos(skillId: string): Promise<SkillVideos> {
  return json<SkillVideos>(await fetch(`${API_BASE}/skills/${skillId}/videos`), 'Failed to load videos');
}

/** Run the search pipeline for a skill (YouTube + transcripts + judging; can take 20-90 s live). */
export async function searchSkillVideos(skillId: string, force = false): Promise<SkillVideos> {
  return json<SkillVideos>(await post(`${API_BASE}/skills/${skillId}/videos/search`, { force }), 'Video search failed');
}

export async function getVideo(videoId: string): Promise<VideoDetail> {
  return json<VideoDetail>(await fetch(`${API_BASE}/videos/${videoId}`), 'Failed to load video');
}

/** Two questions to answer before the video can be marked watched. */
export async function getWatchQuiz(videoId: string): Promise<{ questions: WatchQuizQuestion[] }> {
  return json<{ questions: WatchQuizQuestion[] }>(await fetch(`${API_BASE}/videos/${videoId}/quiz`), 'Failed to load the quiz');
}

/**
 * Mark watched — gated server-side on the quiz: wrong/missing answers get a
 * 400 with `quizResults` (per-question booleans) attached to the error.
 */
export async function markVideoWatched(videoId: string, quizAnswers: string[]): Promise<WatchedResponse> {
  const res = await post(`${API_BASE}/videos/${videoId}/watched`, { quizAnswers });
  if (!res.ok) {
    let msg = `Failed to mark watched (${res.status})`;
    let quizResults: boolean[] | undefined;
    try {
      const body = (await res.json()) as { error?: string; quizResults?: boolean[] };
      if (body.error) msg = body.error;
      quizResults = body.quizResults;
    } catch {
      /* keep fallback */
    }
    const err = new Error(msg) as Error & { quizResults?: boolean[] };
    err.quizResults = quizResults;
    throw err;
  }
  return (await res.json()) as WatchedResponse;
}

export async function getVideoPlan(courseId?: string): Promise<VideoPlan> {
  const qs = courseId ? `?courseId=${encodeURIComponent(courseId)}` : '';
  return json<VideoPlan>(await fetch(`${API_BASE}/learning/videos${qs}`), 'Failed to load video plan');
}

/** Queue background searches for the next unlearned milestones (202 → poll getVideoPlan). */
export async function runVideoPlan(limit = 5): Promise<{ queued: string[] }> {
  return json<{ queued: string[] }>(await post(`${API_BASE}/learning/videos/plan`, { limit }), 'Failed to queue searches');
}

export async function searchCourseVideos(courseId: string, limit = 6): Promise<{ queued: string[] }> {
  return json<{ queued: string[] }>(await post(`${API_BASE}/courses/${courseId}/videos/search`, { limit }), 'Failed to queue searches');
}

export async function getDocumentUsage(): Promise<DocumentUsage> {
  return json<DocumentUsage>(await fetch(`${API_BASE}/learning/document-usage`), 'Failed to load document usage');
}
