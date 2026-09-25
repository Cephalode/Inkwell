import { Router, type Request, type Response } from 'express';
import pool from '../db.js';
import { awardXp, getProfile, recordEvidence, XP_BY_KIND, type Mastery } from '../src/mastery.js';
import { gradeQuiz, getWatchQuiz, stripAnswers } from '../src/watchQuiz.js';
import {
  COVERAGE_FLOOR,
  rankVideos,
  searchVideosForSkill,
  SEARCH_TTL_MS,
  selectSubjectVideos,
  type RankedVideo,
} from '../src/videoSearch.js';

const router = Router();

interface SkillSearchRow {
  id: string;
  label: string;
  mastery: Mastery;
  video_search_status: string;
  video_searched_at: string | null;
  video_search_error: string | null;
}

function skillSearchInfo(row: SkillSearchRow) {
  return {
    id: row.id,
    label: row.label,
    mastery: row.mastery,
    searchStatus: row.video_search_status,
    searchedAt: row.video_searched_at,
    searchError: row.video_search_error,
  };
}

async function loadSkillSearch(id: string): Promise<SkillSearchRow | null> {
  const { rows } = await pool.query(
    'SELECT id, label, mastery, video_search_status, video_searched_at, video_search_error FROM skills WHERE id = $1',
    [id],
  );
  return rows.length ? (rows[0] as SkillSearchRow) : null;
}

const isFresh = (row: SkillSearchRow) =>
  row.video_search_status === 'done' &&
  !!row.video_searched_at &&
  Date.now() - new Date(row.video_searched_at).getTime() < SEARCH_TTL_MS;

// ── Per-skill videos ────────────────────────────────────────────────────────

router.get('/skills/:id/videos', async (req: Request, res: Response) => {
  try {
    const skill = await loadSkillSearch(String(req.params.id));
    if (!skill) return res.status(404).json({ error: 'Skill not found' });
    const videos = await rankVideos({ skillIds: [skill.id], includeLearned: true });
    res.json({ skill: skillSearchInfo(skill), videos: selectSubjectVideos(forSkill(videos, skill.id)) });
  } catch (err) {
    console.error('Error loading skill videos:', err);
    res.status(500).json({ error: 'Failed to load videos' });
  }
});

/** Per-skill ordering: the skill's own coverage matters first, then overall value. */
function forSkill(videos: RankedVideo[], skillId: string): RankedVideo[] {
  return videos
    .filter((v) => v.milestones.some((m) => m.skillId === skillId && m.coverage >= 0.4))
    .sort((a, b) => {
      const ca = a.milestones.find((m) => m.skillId === skillId)!.coverage;
      const cb = b.milestones.find((m) => m.skillId === skillId)!.coverage;
      // A strong match on the requested topic beats a diffuse multi-topic video.
      const sa = a.score * (0.6 + 0.4 * ca);
      const sb = b.score * (0.6 + 0.4 * cb);
      return sb - sa;
    });
}

router.post('/skills/:id/videos/search', async (req: Request, res: Response) => {
  try {
    const skill = await loadSkillSearch(String(req.params.id));
    if (!skill) return res.status(404).json({ error: 'Skill not found' });
    const force = !!(req.body as { force?: boolean })?.force;
    if (!force && isFresh(skill)) {
      const videos = await rankVideos({ skillIds: [skill.id], includeLearned: true });
      return res.json({
        skill: skillSearchInfo(skill),
        videos: selectSubjectVideos(forSkill(videos, skill.id)),
        videosJudged: videos.length,
        cached: true,
      });
    }
    const log: string[] = [];
    const videos = await searchVideosForSkill(skill.id, (m) => log.push(m));
    const fresh = (await loadSkillSearch(skill.id))!;
    res.json({
      skill: skillSearchInfo(fresh),
      videos: selectSubjectVideos(forSkill(videos, skill.id)),
      videosJudged: videos.length,
      cached: false,
      log,
    });
  } catch (err) {
    console.error('Error searching skill videos:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Video search failed' });
  }
});

// ── Video detail & watching ─────────────────────────────────────────────────

router.get('/videos/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const [video] = await rankVideos({ videoIds: [id], includeLearned: true });
    if (!video) {
      const { rows } = await pool.query('SELECT id FROM videos WHERE id = $1', [id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Video not found' });
      // Judged but covers nothing above the floor — still show it.
      const { rows: v } = await pool.query('SELECT * FROM videos WHERE id = $1', [id]);
      const r = v[0];
      return res.json({
        id: r.id, title: r.title, channel: r.channel, durationSeconds: r.duration_seconds, url: r.url,
        thumbnail: `https://i.ytimg.com/vi/${r.id}/mqdefault.jpg`, summary: r.summary, level: r.level,
        focus: Number(r.focus), quality: Number(r.quality), transcriptStatus: r.transcript_status, watchedAt: r.watched_at,
        milestones: [], unlearnedMilestones: 0, coursesTouched: 0, minutesPerMilestone: 0, score: 0, transcriptExcerpt: '',
      });
    }
    const { rows } = await pool.query('SELECT transcript FROM videos WHERE id = $1', [id]);
    const transcript: string = rows[0]?.transcript ?? '';
    res.json({ ...video, transcriptExcerpt: transcript.slice(0, 1200) });
  } catch (err) {
    console.error('Error loading video:', err);
    res.status(500).json({ error: 'Failed to load video' });
  }
});

// ── Watch quiz ──────────────────────────────────────────────────────────────

/** Two questions to answer before a video can be marked watched (no answers shipped). */
router.get('/videos/:id/quiz', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const [video] = await rankVideos({ videoIds: [id], includeLearned: true });
    if (!video) {
      const { rows } = await pool.query('SELECT id FROM videos WHERE id = $1', [id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Video not found' });
      return res.status(409).json({ error: 'This video has not been judged against any milestones yet' });
    }
    const quiz = await getWatchQuiz(video);
    res.json({ questions: stripAnswers(quiz) });
  } catch (err) {
    console.error('Error loading watch quiz:', err);
    res.status(500).json({ error: 'Failed to load the quiz' });
  }
});

/**
 * Mark a video watched: weak evidence on every unlearned milestone it teaches
 * (a video is a lesson, not an assessment) and XP the first time.
 * Gated on the two-question comprehension check — both must be correct.
 */
router.post('/videos/:id/watched', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const [video] = await rankVideos({ videoIds: [id], includeLearned: true });
    if (!video) return res.status(404).json({ error: 'Video not found' });

    const quiz = await getWatchQuiz(video);
    const rawAnswers = (req.body as { quizAnswers?: unknown })?.quizAnswers;
    const answers = Array.isArray(rawAnswers) ? rawAnswers.map((a) => String(a)) : [];
    const results = gradeQuiz(quiz, answers);
    if (!results.every(Boolean)) {
      return res.status(400).json({
        error: 'Answer both questions correctly to mark this video watched',
        quizResults: results,
      });
    }

    const firstTime = !video.watchedAt;
    await pool.query('UPDATE videos SET watched_at = now(), updated_at = now() WHERE id = $1', [id]);

    const skills = [];
    for (const m of video.milestones) {
      if (m.coverage < COVERAGE_FLOOR || m.mastery === 'learned') continue;
      const courseId = m.courses[0]?.courseId ?? null;
      const r = await recordEvidence(m.skillId, {
        kind: 'video',
        score: Math.min(0.75, m.coverage * 0.75),
        weight: 0.4,
        note: `Watched "${video.title.slice(0, 60)}"`,
        courseId,
      });
      skills.push({ skillId: m.skillId, label: m.label, mastery: r.mastery, masteryScore: r.score, previous: r.previous });
    }
    const xpGained = firstTime ? XP_BY_KIND.video : 0;
    const profile = xpGained ? await awardXp(xpGained) : await getProfile();
    const [updated] = await rankVideos({ videoIds: [id], includeLearned: true });
    res.json({ video: updated ?? video, skills, xpGained, profile });
  } catch (err) {
    console.error('Error marking video watched:', err);
    res.status(500).json({ error: 'Failed to mark watched' });
  }
});

// ── The plan: all unlearned milestones, best videos first ───────────────────

interface MilestoneRow {
  id: string;
  label: string;
  mastery: Mastery;
  video_search_status: string;
  video_searched_at: string | null;
  video_search_error: string | null;
  courses: Array<{ courseId: string; courseName: string; stepId: string; position: number }>;
}

async function loadUnlearnedMilestones(courseId?: string): Promise<MilestoneRow[]> {
  const { rows } = await pool.query(
    `SELECT k.id, k.label, k.mastery, k.video_search_status, k.video_searched_at, k.video_search_error,
            json_agg(json_build_object('courseId', r.course_id, 'courseName', c.name, 'stepId', s.id, 'position', s.position)
                     ORDER BY r.course_id) AS courses
     FROM skills k
     JOIN roadmap_steps s ON s.skill_id = k.id
     JOIN roadmaps r ON r.id = s.roadmap_id
     JOIN courses c ON c.id = r.course_id
     WHERE k.mastery <> 'learned'
       ${courseId ? 'AND k.id IN (SELECT s2.skill_id FROM roadmap_steps s2 JOIN roadmaps r2 ON r2.id = s2.roadmap_id WHERE r2.course_id = $1)' : ''}
     GROUP BY k.id`,
    courseId ? [courseId] : [],
  );
  const list = rows as MilestoneRow[];
  // Milestones shared by more courses come first (learn once, count everywhere), then by how early they are taught.
  list.sort((a, b) => {
    const d = b.courses.length - a.courses.length;
    if (d !== 0) return d;
    return Math.min(...a.courses.map((c) => c.position)) - Math.min(...b.courses.map((c) => c.position));
  });
  return list;
}

async function buildPlan(courseId?: string) {
  const milestones = await loadUnlearnedMilestones(courseId);
  const videos = await rankVideos({ limit: 60 });
  const scoped = courseId
    ? videos.filter((v) => v.milestones.some((m) => m.mastery !== 'learned' && m.courses.some((c) => c.courseId === courseId)))
    : videos;
  const bestBySkill = new Map<string, RankedVideo>();
  const countBySkill = new Map<string, number>();
  for (const v of scoped) {
    for (const m of v.milestones) {
      countBySkill.set(m.skillId, (countBySkill.get(m.skillId) ?? 0) + 1);
      if (!bestBySkill.has(m.skillId)) bestBySkill.set(m.skillId, v);
    }
  }
  // bestVideoId points at the curated watch list, so the milestone row shows
  // the same leading video the step page does (not just the highest scorer).
  const curatedBySkill = new Map<string, RankedVideo>();
  for (const [skillId] of bestBySkill) {
    const curated = selectSubjectVideos(forSkill(scoped, skillId));
    if (curated.length > 0) curatedBySkill.set(skillId, curated[0]);
  }
  return {
    milestones: milestones.map((m) => ({
      skillId: m.id,
      label: m.label,
      mastery: m.mastery,
      courses: m.courses,
      searchStatus: m.video_search_status,
      searchedAt: m.video_searched_at,
      searchError: m.video_search_error,
      bestVideoId: curatedBySkill.get(m.id)?.id ?? null,
      videoCount: countBySkill.get(m.id) ?? 0,
    })),
    videos: scoped,
    stats: {
      unlearned: milestones.length,
      shared: milestones.filter((m) => m.courses.length > 1).length,
      searched: milestones.filter((m) => m.video_search_status === 'done').length,
      searching: milestones.filter((m) => m.video_search_status === 'searching').length,
      videos: scoped.length,
    },
  };
}

router.get('/learning/videos', async (req: Request, res: Response) => {
  try {
    const courseId = typeof req.query.courseId === 'string' ? req.query.courseId : undefined;
    res.json(await buildPlan(courseId));
  } catch (err) {
    console.error('Error building video plan:', err);
    res.status(500).json({ error: 'Failed to build video plan' });
  }
});

/** Background job: search the given skills one after another (gentle on YouTube). */
const queued = new Set<string>();
async function runSearches(skillIds: string[]): Promise<void> {
  for (const id of skillIds) {
    if (queued.has(id)) continue;
    queued.add(id);
    try {
      await searchVideosForSkill(id, (m) => console.log(`[videos] ${id}: ${m}`));
    } catch (err) {
      console.error(`[videos] search failed for ${id}:`, err);
    } finally {
      queued.delete(id);
    }
  }
}

async function queueSearches(courseId: string | undefined, limit: number) {
  const milestones = await loadUnlearnedMilestones(courseId);
  const todo = milestones
    .filter((m) => m.video_search_status !== 'searching')
    .filter((m) => !(m.video_search_status === 'done' && m.video_searched_at && Date.now() - new Date(m.video_searched_at).getTime() < SEARCH_TTL_MS))
    .slice(0, limit)
    .map((m) => m.id);
  if (todo.length) {
    await pool.query(`UPDATE skills SET video_search_status = 'searching', video_search_error = NULL, updated_at = now() WHERE id = ANY($1)`, [todo]);
    void runSearches(todo);
  }
  return todo;
}

router.post('/learning/videos/plan', async (req: Request, res: Response) => {
  try {
    const limit = Math.max(1, Math.min(12, Number((req.body as { limit?: number })?.limit) || 5));
    const queuedIds = await queueSearches(undefined, limit);
    res.status(202).json({ queued: queuedIds });
  } catch (err) {
    console.error('Error queueing video plan:', err);
    res.status(500).json({ error: 'Failed to queue video searches' });
  }
});

router.post('/courses/:courseId/videos/search', async (req: Request, res: Response) => {
  try {
    const limit = Math.max(1, Math.min(12, Number((req.body as { limit?: number })?.limit) || 6));
    const queuedIds = await queueSearches(String(req.params.courseId), limit);
    res.status(202).json({ queued: queuedIds });
  } catch (err) {
    console.error('Error queueing course video searches:', err);
    res.status(500).json({ error: 'Failed to queue video searches' });
  }
});

export default router;
