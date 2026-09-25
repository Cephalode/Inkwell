/**
 * Mastery engine for the learning suite.
 *
 * A skill's mastery is derived from its evidence trail (`skill_evidence`):
 * every completed activity leaves a score in [0, 1] with a weight, and the
 * skill's rolling score is a recency-biased weighted mean of those scores.
 * The rules are deliberately simple and deterministic so they can be audited
 * from the trail alone:
 *
 *   • `learning`  — any evidence at all
 *   • `learned`   — score ≥ LEARNED_THRESHOLD, at least MIN_EVIDENCE signals,
 *                   and at least one *assessment* (quiz / discussion / recall)
 *                   that scored ≥ ASSESSMENT_FLOOR. A lesson or a flashcard
 *                   pass on its own never marks a topic learned — the student
 *                   has to demonstrate it.
 *   • the tutor's verdict is decisive: a discussion that closed with
 *     "learned" marks the topic learned unless a later assessment failed.
 *   • manual evidence (the student says "I already know this") is trusted
 *     outright and can also reset a skill.
 *
 * Because a skill row is shared by every course that teaches the topic, a
 * skill learned in one course is learned everywhere.
 */

import pool from '../db.js';

export type Mastery = 'not_started' | 'learning' | 'learned';

export type EvidenceKind = 'lesson' | 'quiz' | 'flashcards' | 'discussion' | 'recall' | 'video' | 'manual' | 'podcast';

export interface EvidenceInput {
  kind: EvidenceKind;
  /** 0..1 */
  score: number;
  weight?: number;
  note?: string;
  activityId?: string | null;
  courseId?: string | null;
}

interface EvidenceRow {
  kind: EvidenceKind;
  score: number;
  weight: number;
  created_at: string | Date;
}

export const LEARNED_THRESHOLD = 0.8;
const MIN_EVIDENCE = 2;
const ASSESSMENT_FLOOR = 0.7;
/** Recency decay per step back in the trail (newest = 1, then 0.7, 0.49, …). */
const RECENCY_DECAY = 0.7;

const ASSESSMENT_KINDS: ReadonlySet<EvidenceKind> = new Set(['quiz', 'discussion', 'recall']);

/** XP awarded per completed activity kind (Duolingo-style rewards). */
export const XP_BY_KIND: Record<EvidenceKind, number> = {
  lesson: 10,
  video: 10,
  flashcards: 15,
  quiz: 20,
  recall: 25,
  discussion: 30,
  podcast: 15,
  manual: 0,
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

/**
 * Pure: derive (score, mastery) from an evidence trail in chronological order.
 * A `manual` signal is authoritative — the latest one wins outright.
 */
export function computeMastery(trail: EvidenceRow[]): { score: number; mastery: Mastery } {
  if (trail.length === 0) return { score: 0, mastery: 'not_started' };

  const sorted = [...trail].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  // Manual override: trust the most recent manual signal completely.
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].kind === 'manual') {
      const s = clamp01(sorted[i].score);
      return { score: s, mastery: s >= LEARNED_THRESHOLD ? 'learned' : s > 0 ? 'learning' : 'not_started' };
    }
  }

  let num = 0;
  let den = 0;
  const n = sorted.length;
  sorted.forEach((e, i) => {
    const recency = Math.pow(RECENCY_DECAY, n - 1 - i);
    const w = Math.max(0.01, e.weight) * recency;
    num += clamp01(e.score) * w;
    den += w;
  });
  const score = den > 0 ? num / den : 0;

  const passedAssessment = sorted.some(
    (e) => ASSESSMENT_KINDS.has(e.kind) && clamp01(e.score) >= ASSESSMENT_FLOOR,
  );
  const byTrail = score >= LEARNED_THRESHOLD && n >= MIN_EVIDENCE && passedAssessment;

  // The tutor's verdict is decisive: when the latest discussion closed with
  // "learned" (score ≥ threshold) and no assessment since then has failed,
  // the topic is learned even if earlier attempts drag the average down.
  let tutorScore = 0;
  const lastDiscussion = sorted.map((e, i) => ({ e, i })).reverse().find(({ e }) => e.kind === 'discussion');
  if (lastDiscussion && clamp01(lastDiscussion.e.score) >= LEARNED_THRESHOLD) {
    const since = sorted.slice(lastDiscussion.i + 1).filter((e) => ASSESSMENT_KINDS.has(e.kind));
    if (since.every((e) => clamp01(e.score) >= 0.5)) tutorScore = clamp01(lastDiscussion.e.score);
  }

  const learned = byTrail || tutorScore > 0;
  return { score: learned ? Math.max(score, tutorScore) : score, mastery: learned ? 'learned' : 'learning' };
}

/**
 * Append evidence for a skill, recompute its mastery from the full trail and
 * persist it. Returns the skill's new state.
 */
export async function recordEvidence(
  skillId: string,
  input: EvidenceInput,
): Promise<{ score: number; mastery: Mastery; previous: Mastery }> {
  const { rows: before } = await pool.query('SELECT mastery FROM skills WHERE id = $1', [skillId]);
  const previous: Mastery = (before[0]?.mastery as Mastery) ?? 'not_started';

  await pool.query(
    `INSERT INTO skill_evidence (skill_id, activity_id, course_id, kind, score, weight, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      skillId,
      input.activityId ?? null,
      input.courseId ?? null,
      input.kind,
      clamp01(input.score),
      input.weight ?? 1,
      input.note ?? '',
    ],
  );

  return { ...(await recomputeSkill(skillId)), previous };
}

/** Recompute and persist one skill's mastery from its evidence trail. */
export async function recomputeSkill(skillId: string): Promise<{ score: number; mastery: Mastery }> {
  const { rows } = await pool.query(
    'SELECT kind, score, weight, created_at FROM skill_evidence WHERE skill_id = $1 ORDER BY created_at ASC',
    [skillId],
  );
  const { score, mastery } = computeMastery(rows as EvidenceRow[]);
  await pool.query(
    `UPDATE skills
     SET mastery = $1,
         mastery_score = $2,
         learned_at = CASE WHEN $1 = 'learned' THEN COALESCE(learned_at, now()) ELSE NULL END,
         updated_at = now()
     WHERE id = $3`,
    [mastery, score, skillId],
  );
  return { score, mastery };
}

/**
 * Award XP and advance the streak. Uses the server's local date; Inkwell is a
 * single-user app so there is no per-user timezone to honour.
 */
export async function awardXp(amount: number): Promise<{
  xp: number;
  xpToday: number;
  streak: number;
  longestStreak: number;
  dailyGoalXp: number;
  lastActiveOn: string;
  goalHitToday: boolean;
}> {
  const today = localDate(new Date());
  const yesterday = localDate(new Date(Date.now() - 86_400_000));

  const { rows } = await pool.query('SELECT * FROM learner_profile WHERE id = 1');
  const p = rows[0] ?? { xp: 0, streak: 0, longest_streak: 0, last_active_on: null, daily_goal_xp: 50, xp_today: 0 };
  const last = p.last_active_on ? localDate(new Date(p.last_active_on)) : null;

  let streak = p.streak as number;
  let xpToday = p.xp_today as number;
  if (last !== today) {
    streak = last === yesterday ? streak + 1 : 1;
    xpToday = 0;
  }
  xpToday += amount;
  const xp = (p.xp as number) + amount;
  const longest = Math.max(p.longest_streak as number, streak);

  await pool.query(
    `INSERT INTO learner_profile (id, xp, streak, longest_streak, last_active_on, daily_goal_xp, xp_today, updated_at)
     VALUES (1, $1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (id) DO UPDATE SET
       xp = EXCLUDED.xp, streak = EXCLUDED.streak, longest_streak = EXCLUDED.longest_streak,
       last_active_on = EXCLUDED.last_active_on, xp_today = EXCLUDED.xp_today, updated_at = now()`,
    [xp, streak, longest, today, p.daily_goal_xp, xpToday],
  );

  return {
    xp,
    xpToday,
    streak,
    longestStreak: longest,
    dailyGoalXp: p.daily_goal_xp as number,
    lastActiveOn: today,
    goalHitToday: xpToday >= (p.daily_goal_xp as number),
  };
}

/** Read the learner profile (creating the row if the migration seed is missing). */
export async function getProfile(): Promise<{
  xp: number;
  xpToday: number;
  streak: number;
  longestStreak: number;
  dailyGoalXp: number;
  lastActiveOn: string | null;
  goalHitToday: boolean;
}> {
  const { rows } = await pool.query('SELECT * FROM learner_profile WHERE id = 1');
  const p = rows[0] ?? { xp: 0, streak: 0, longest_streak: 0, last_active_on: null, daily_goal_xp: 50, xp_today: 0 };
  const today = localDate(new Date());
  const yesterday = localDate(new Date(Date.now() - 86_400_000));
  const last = p.last_active_on ? localDate(new Date(p.last_active_on)) : null;
  // A streak only survives if the learner was active today or yesterday.
  const streak = last === today || last === yesterday ? (p.streak as number) : 0;
  const xpToday = last === today ? (p.xp_today as number) : 0;
  return {
    xp: p.xp as number,
    xpToday,
    streak,
    longestStreak: p.longest_streak as number,
    dailyGoalXp: p.daily_goal_xp as number,
    lastActiveOn: last,
    goalHitToday: xpToday >= (p.daily_goal_xp as number),
  };
}

function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Normalise a topic label into the shared skill slug. */
export function skillSlug(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[‘’'"`]/g, '')
    .replace(/[^a-z0-9+#.&/ -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
