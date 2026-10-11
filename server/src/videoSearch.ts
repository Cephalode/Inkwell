/**
 * Topic video search — "find exactly what is being looked for, and waste as
 * little of the learner's time as possible".
 *
 * Pipeline for one target skill (a roadmap milestone):
 *
 *  1. BUNDLE   — the target plus its unlearned neighbours: the next steps on
 *                every roadmap that teaches it. Videos are judged against the
 *                whole bundle so one that teaches several milestones is
 *                recognised and rewarded.
 *  2. QUERIES  — a few precise YouTube queries: the concept with a
 *                discriminating term from its objectives, a lecture-style
 *                query, and a "combo" query naming a neighbour so multi-topic
 *                videos surface.
 *  3. RETRIEVE — scrape YouTube results for each query (no API key needed),
 *                dedupe, drop shorts and marathons.
 *  4. PRE-RANK — cheap heuristics (title overlap, duration sweet spot, known
 *                teaching channels) pick the candidates worth a transcript.
 *  5. EVIDENCE — fetch captions (cached on `videos`); sample the transcript
 *                start / middle / end so the judge sees the whole arc.
 *  6. JUDGE    — an LLM reads the transcript sample against each bundle
 *                skill's objectives and reports coverage, confidence, where in
 *                the video it happens, focus, level and quality. Persisted to
 *                `video_coverage` (low coverage too, so nothing is re-judged).
 *  7. RANK     — on read (`rankVideos`): value = Σ coverage × confidence ×
 *                demand (how many courses teach the milestone) over milestones
 *                the learner has NOT learned yet, with a bonus for covering
 *                several at once; divided by a sub-linear time cost so a
 *                20-minute video covering three milestones beats three
 *                8-minute videos; scaled by focus and quality.
 */

import pool from '../db.js';
import { callGLMJson } from './llm.js';
import { searchYouTube, type VideoCandidate } from './videoFinder.js';
import { fetchYouTubeTranscript } from './transcriptFetcher.js';
import type { Mastery } from './mastery.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface SkillCourseRef {
  courseId: string;
  courseName: string;
  stepId: string;
  position: number;
}

export interface SkillBrief {
  id: string;
  label: string;
  description: string;
  objectives: string[];
  keyPoints: string[];
  mastery: Mastery;
  courses: SkillCourseRef[];
}

export interface VideoMilestone {
  skillId: string;
  label: string;
  coverage: number;
  confidence: number;
  mastery: Mastery;
  courses: Array<{ courseId: string; courseName: string; stepId: string }>;
  objectivesCovered: string[];
  startSeconds: number | null;
  endSeconds: number | null;
  reason: string;
}

export interface RankedVideo {
  id: string;
  title: string;
  channel: string;
  durationSeconds: number;
  url: string;
  thumbnail: string;
  summary: string;
  level: string;
  focus: number;
  quality: number;
  transcriptStatus: string;
  watchedAt: string | null;
  milestones: VideoMilestone[];
  /** Milestones covered (≥ floor) the learner has not learned yet. */
  unlearnedMilestones: number;
  /** Distinct courses those milestones belong to. */
  coursesTouched: number;
  minutesPerMilestone: number;
  score: number;
}

export interface SearchLog {
  (message: string): void;
}

// ── Tunables ────────────────────────────────────────────────────────────────

/** Coverage below this is "mentions it", not "teaches it". */
export const COVERAGE_FLOOR = 0.3;
const NEIGHBOURS_PER_ROADMAP = 2;
const RESULTS_PER_QUERY = 8;
const CANDIDATES_TO_JUDGE = 10;
const MIN_SECONDS = 60;
const MAX_SECONDS = 3 * 60 * 60;
const JUDGE_CONCURRENCY = 4;
const TRANSCRIPT_SAMPLE_CHARS = 6_000;
/** Re-search a skill after this long. */
export const SEARCH_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const KNOWN_TEACHERS = [
  '3blue1brown', 'statquest', 'khan academy', 'mit opencourseware', 'freecodecamp', 'stanford', 'deeplearningai',
  'ibm technology', 'google for developers', 'computerphile', 'crash course', 'ritvikmath', 'serrano', 'yannic',
  'sentdex', 'two minute papers', 'art of the problem', 'visually explained', 'the organic chemistry tutor',
  'professor leonard', 'nptel', 'harvard', 'berkeley', 'caltech', 'coursera', 'edx', 'ai coffee break', 'codebasics',
  'assemblyai', 'simplilearn', 'normalized nerd', 'primer', 'welch labs', 'zach star', 'ben eater', 'fireship',
];

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'over', 'under', 'that', 'this', 'what', 'how', 'why', 'intro', 'introduction', 'basics', 'basic', 'guide', 'tutorial', 'explained', 'lecture', 'part', 'of', 'in', 'to', 'a', 'an', 'on', 'vs', 'versus']);

const clamp01 = (n: unknown): number => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
};
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : String(x ?? ''))).filter(Boolean) : [];

/** "1:02:33" / "20:33" / "0:45" → seconds. */
export function parseDuration(text: string): number {
  const parts = text.trim().split(':').map((p) => parseInt(p, 10));
  if (parts.some((p) => !Number.isFinite(p))) return 0;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

const tokens = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9+#. ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));

// ── Skill briefs & bundles ──────────────────────────────────────────────────

/** Skills with their objectives/key points (unioned across every step that teaches them) and courses. */
export async function loadSkillBriefs(skillIds: string[]): Promise<Map<string, SkillBrief>> {
  if (skillIds.length === 0) return new Map();
  const { rows } = await pool.query(
    `SELECT k.id, k.label, k.description, k.mastery,
            COALESCE(json_agg(json_build_object(
              'courseId', r.course_id, 'courseName', c.name, 'stepId', s.id, 'position', s.position,
              'objectives', s.objectives, 'keyPoints', s.key_points
            ) ORDER BY r.course_id) FILTER (WHERE s.id IS NOT NULL), '[]') AS steps
     FROM skills k
     LEFT JOIN roadmap_steps s ON s.skill_id = k.id
     LEFT JOIN roadmaps r ON r.id = s.roadmap_id
     LEFT JOIN courses c ON c.id = r.course_id
     WHERE k.id = ANY($1)
     GROUP BY k.id`,
    [skillIds],
  );
  const out = new Map<string, SkillBrief>();
  for (const row of rows) {
    const steps = row.steps as Array<{ courseId: string; courseName: string; stepId: string; position: number; objectives: unknown; keyPoints: unknown }>;
    out.set(row.id, {
      id: row.id,
      label: row.label,
      description: row.description ?? '',
      mastery: row.mastery as Mastery,
      objectives: [...new Set(steps.flatMap((s) => strArr(s.objectives)))].slice(0, 8),
      keyPoints: [...new Set(steps.flatMap((s) => strArr(s.keyPoints)))].slice(0, 10),
      courses: steps.map((s) => ({ courseId: s.courseId, courseName: s.courseName, stepId: s.stepId, position: s.position })),
    });
  }
  return out;
}

/**
 * Unlearned skills taught right after the target on each roadmap that teaches
 * it — the milestones a good video might cover in the same sitting.
 */
export async function neighbourSkills(target: SkillBrief): Promise<SkillBrief[]> {
  const ids = new Set<string>();
  for (const c of target.courses) {
    const { rows } = await pool.query(
      `SELECT s.skill_id FROM roadmap_steps s
       JOIN roadmaps r ON r.id = s.roadmap_id
       JOIN skills k ON k.id = s.skill_id
       WHERE r.course_id = $1 AND s.position > $2 AND k.mastery <> 'learned'
       ORDER BY s.position ASC LIMIT $3`,
      [c.courseId, c.position, NEIGHBOURS_PER_ROADMAP],
    );
    for (const r of rows) if (r.skill_id !== target.id) ids.add(r.skill_id);
  }
  const briefs = await loadSkillBriefs([...ids]);
  return [...briefs.values()];
}

// ── Query generation ────────────────────────────────────────────────────────

interface SearchQuery {
  q: string;
  intent: 'precise' | 'lecture' | 'combo';
}

function fallbackQueries(target: SkillBrief, neighbours: SkillBrief[]): SearchQuery[] {
  const label = target.label;
  const out: SearchQuery[] = [
    { q: `${label} explained`, intent: 'precise' },
    { q: `${label} lecture tutorial`, intent: 'lecture' },
  ];
  const first = neighbours[0];
  if (first) out.push({ q: `${label} ${first.label}`, intent: 'combo' });
  return out;
}

async function generateQueries(target: SkillBrief, neighbours: SkillBrief[]): Promise<SearchQuery[]> {
  try {
    const out = await callGLMJson<{ queries?: unknown }>(
      [
        {
          role: 'system',
          content:
            'You write YouTube search queries that find the exact educational video a learner needs. Queries are short (3-8 words), specific, and use the terms an expert would use.',
        },
        {
          role: 'user',
          content: `Target topic: ${target.label}
${target.description ? `About: ${target.description}\n` : ''}Learning objectives:
${target.objectives.map((o) => `- ${o}`).join('\n') || '- understand and apply the topic'}
${neighbours.length ? `\nTopics the learner needs right after this one (a video covering the target AND one of these saves time):\n${neighbours.map((n) => `- ${n.label}`).join('\n')}\n` : ''}
Write 4 YouTube search queries:
1. "precise": the concept plus one discriminating term from the objectives, so results teach exactly this and not a neighbouring idea.
2. "precise": a second phrasing an instructor would use.
3. "lecture": a full lesson/lecture style query.
${neighbours.length ? '4. "combo": the target together with the most closely related follow-up topic above, to find a single video that teaches both.' : '4. "lecture": a worked-example / intuition query.'}

Respond with ONLY JSON: {"queries": [{"q": "...", "intent": "precise|lecture|combo"}]}`,
        },
      ],
      { temperature: 0.3, maxTokens: 600 },
    );
    const raw = Array.isArray(out?.queries) ? (out!.queries as Array<Record<string, unknown>>) : [];
    const queries = raw
      .filter((q) => q && typeof q.q === 'string' && q.q.trim())
      .map((q) => ({
        q: String(q.q).trim().slice(0, 120),
        intent: (q.intent === 'lecture' || q.intent === 'combo' ? q.intent : 'precise') as SearchQuery['intent'],
      }))
      .slice(0, 5);
    return queries.length >= 2 ? queries : fallbackQueries(target, neighbours);
  } catch {
    return fallbackQueries(target, neighbours);
  }
}

// ── Retrieval & pre-ranking ─────────────────────────────────────────────────

interface Candidate extends VideoCandidate {
  seconds: number;
  hits: number;
  prescore: number;
}

function durationScore(seconds: number): number {
  const m = seconds / 60;
  if (m >= 4 && m <= 45) return 1;
  if (m < 4) return 0.5;
  if (m <= 120) return 0.7;
  return 0.4;
}

function titleOverlap(title: string, skills: SkillBrief[]): number {
  const t = new Set(tokens(title));
  let best = 0;
  for (const s of skills) {
    const lt = tokens(s.label);
    if (lt.length === 0) continue;
    const hit = lt.filter((x) => t.has(x)).length / lt.length;
    best = Math.max(best, hit);
  }
  return best;
}

function reputation(channel: string): number {
  const c = channel.toLowerCase();
  return KNOWN_TEACHERS.some((k) => c.includes(k)) ? 0.3 : 0;
}

async function retrieve(queries: SearchQuery[], bundle: SkillBrief[], log?: SearchLog): Promise<Candidate[]> {
  const settled = await Promise.allSettled(queries.map((q) => searchYouTube(q.q, RESULTS_PER_QUERY)));
  const byId = new Map<string, Candidate>();
  let failures = 0;
  for (const s of settled) {
    if (s.status !== 'fulfilled') {
      failures++;
      continue;
    }
    for (const v of s.value) {
      const seconds = parseDuration(v.duration);
      if (seconds < MIN_SECONDS || seconds > MAX_SECONDS) continue;
      const existing = byId.get(v.videoId);
      if (existing) {
        existing.hits++;
        continue;
      }
      byId.set(v.videoId, { ...v, seconds, hits: 1, prescore: 0 });
    }
  }
  if (failures) log?.(`${failures}/${queries.length} YouTube searches failed`);
  const list = [...byId.values()];
  for (const c of list) {
    c.prescore =
      0.55 * titleOverlap(c.title, bundle) +
      0.25 * durationScore(c.seconds) +
      reputation(c.channel) +
      0.1 * Math.min(3, c.hits - 1);
  }
  list.sort((a, b) => b.prescore - a.prescore);
  return list;
}

// ── Evidence (transcripts) ──────────────────────────────────────────────────

async function ensureVideoRow(c: Candidate): Promise<void> {
  await pool.query(
    `INSERT INTO videos (id, title, channel, duration_seconds, url)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, channel = EXCLUDED.channel,
       duration_seconds = GREATEST(videos.duration_seconds, EXCLUDED.duration_seconds), updated_at = now()`,
    [c.videoId, c.title, c.channel, c.seconds, `https://www.youtube.com/watch?v=${c.videoId}`],
  );
}

async function ensureTranscript(videoId: string): Promise<string | null> {
  const { rows } = await pool.query('SELECT transcript, transcript_status FROM videos WHERE id = $1', [videoId]);
  const row = rows[0];
  if (row?.transcript_status === 'ok' && row.transcript) return row.transcript as string;
  if (row?.transcript_status === 'missing') return null;
  try {
    const t = await fetchYouTubeTranscript(`https://www.youtube.com/watch?v=${videoId}`);
    await pool.query(`UPDATE videos SET transcript = $1, transcript_status = 'ok', updated_at = now() WHERE id = $2`, [
      t.transcript,
      videoId,
    ]);
    return t.transcript;
  } catch (err) {
    const missing = err instanceof Error && /No captions|not playable/i.test(err.message);
    await pool.query(`UPDATE videos SET transcript_status = $1, updated_at = now() WHERE id = $2`, [
      missing ? 'missing' : 'error',
      videoId,
    ]);
    return null;
  }
}

/** Start / middle / end slices so the judge sees the whole arc of a long video. */
export function sampleTranscript(transcript: string, max = TRANSCRIPT_SAMPLE_CHARS): string {
  if (transcript.length <= max) return transcript;
  const head = Math.floor(max * 0.5);
  const mid = Math.floor(max * 0.25);
  const tail = max - head - mid;
  const midStart = Math.floor(transcript.length / 2 - mid / 2);
  return `${transcript.slice(0, head)}\n[…]\n${transcript.slice(midStart, midStart + mid)}\n[…]\n${transcript.slice(-tail)}`;
}

// ── Judging ─────────────────────────────────────────────────────────────────

interface Judgement {
  summary: string;
  level: string;
  focus: number;
  quality: number;
  skills: Array<{
    skillId: string;
    coverage: number;
    confidence: number;
    objectivesCovered: string[];
    startSeconds: number | null;
    endSeconds: number | null;
    reason: string;
  }>;
}

async function judgeVideo(c: Candidate, transcript: string | null, bundle: SkillBrief[]): Promise<Judgement | null> {
  const skillsBlock = bundle
    .map(
      (s) => `skillId ${s.id} — ${s.label}
  objectives: ${s.objectives.join(' | ') || '(none)'}
  key points: ${s.keyPoints.slice(0, 5).join(' | ') || '(none)'}`,
    )
    .join('\n');
  const evidence = transcript
    ? `Transcript sample (start / middle / end):\n${sampleTranscript(transcript)}`
    : 'No captions are available — judge from the title and channel only, and cap confidence at 0.4.';

  const out = await callGLMJson<Record<string, unknown>>(
    [
      {
        role: 'system',
        content:
          'You are a strict curriculum reviewer deciding whether a YouTube video actually TEACHES specific learning milestones. Mentioning a term is not teaching it. Be honest about coverage; learners pay with their time.',
      },
      {
        role: 'user',
        content: `Video: "${c.title}" — channel ${c.channel || 'unknown'} — ${Math.round(c.seconds / 60)} min.
${evidence}

Milestones to check:
${skillsBlock}

For EVERY milestone above report:
- coverage: 0-1, the fraction of its objectives this video genuinely teaches (0 = not covered, 1 = fully taught with examples).
- confidence: 0-1 in your judgement.
- objectivesCovered: the objective strings it covers (verbatim).
- startMinute / endMinute: where in the video that milestone is taught — read the [m:ss] markers in the transcript sample and pick the cue where teaching of that milestone starts/ends (null if unknown or not covered).
- reason: ≤ 20 words.
Also give: summary (2 sentences on what the video teaches), level ("intro" | "intermediate" | "advanced"), focus (0-1 share of the video spent on these milestones rather than other material), quality (0-1 clarity and correctness of the teaching).

Respond with ONLY JSON: {"summary": "...", "level": "...", "focus": 0.0, "quality": 0.0, "skills": [{"skillId": "...", "coverage": 0.0, "confidence": 0.0, "objectivesCovered": ["..."], "startMinute": 0, "endMinute": 0, "reason": "..."}]}`,
      },
    ],
    { temperature: 0.2, maxTokens: 2500 },
  );
  if (!out) return null;
  const known = new Set(bundle.map((s) => s.id));
  const skills = (Array.isArray(out.skills) ? (out.skills as Array<Record<string, unknown>>) : [])
    .filter((s) => s && typeof s.skillId === 'string' && known.has(s.skillId))
    .map((s) => {
      const conf = clamp01(s.confidence);
      const start = Number(s.startMinute);
      const end = Number(s.endMinute);
      return {
        skillId: String(s.skillId),
        coverage: clamp01(s.coverage),
        confidence: transcript ? conf : Math.min(conf, 0.4),
        objectivesCovered: strArr(s.objectivesCovered),
        startSeconds: Number.isFinite(start) && start >= 0 ? Math.round(start * 60) : null,
        endSeconds: Number.isFinite(end) && end > 0 ? Math.round(end * 60) : null,
        reason: typeof s.reason === 'string' ? s.reason : '',
      };
    });
  // Any bundle skill the judge skipped counts as judged-not-covered.
  for (const s of bundle) {
    if (!skills.some((x) => x.skillId === s.id)) {
      skills.push({ skillId: s.id, coverage: 0, confidence: 0.5, objectivesCovered: [], startSeconds: null, endSeconds: null, reason: 'not mentioned' });
    }
  }
  return {
    summary: typeof out.summary === 'string' ? out.summary : '',
    level: ['intro', 'intermediate', 'advanced'].includes(String(out.level)) ? String(out.level) : '',
    focus: clamp01(out.focus),
    quality: clamp01(out.quality),
    skills,
  };
}

async function persistJudgement(videoId: string, j: Judgement): Promise<void> {
  await pool.query(
    `UPDATE videos SET summary = CASE WHEN $1 <> '' THEN $1 ELSE summary END, level = CASE WHEN $2 <> '' THEN $2 ELSE level END,
       focus = $3, quality = $4, judged_at = now(), updated_at = now() WHERE id = $5`,
    [j.summary, j.level, j.focus, j.quality, videoId],
  );
  for (const s of j.skills) {
    await pool.query(
      `INSERT INTO video_coverage (video_id, skill_id, coverage, confidence, objectives_covered, start_seconds, end_seconds, reason)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
       ON CONFLICT (video_id, skill_id) DO UPDATE SET coverage = EXCLUDED.coverage, confidence = EXCLUDED.confidence,
         objectives_covered = EXCLUDED.objectives_covered, start_seconds = EXCLUDED.start_seconds,
         end_seconds = EXCLUDED.end_seconds, reason = EXCLUDED.reason, updated_at = now()`,
      [videoId, s.skillId, s.coverage, s.confidence, JSON.stringify(s.objectivesCovered), s.startSeconds, s.endSeconds, s.reason],
    );
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

// ── The search ──────────────────────────────────────────────────────────────

/**
 * Run the full pipeline for one skill. Marks the skill's search status and
 * returns the ranked videos for it. Safe to call again — judged pairs are
 * reused, only new candidates are fetched and judged.
 */
export async function searchVideosForSkill(skillId: string, log?: SearchLog): Promise<RankedVideo[]> {
  const briefs = await loadSkillBriefs([skillId]);
  const target = briefs.get(skillId);
  if (!target) throw new Error('Skill not found');

  await pool.query(`UPDATE skills SET video_search_status = 'searching', video_search_error = NULL, updated_at = now() WHERE id = $1`, [skillId]);
  try {
    const neighbours = await neighbourSkills(target);
    const bundle = [target, ...neighbours];
    log?.(`Bundle: ${bundle.map((b) => b.label).join(' · ')}`);

    const queries = await generateQueries(target, neighbours);
    log?.(`Queries: ${queries.map((q) => `"${q.q}"`).join(', ')}`);

    const candidates = await retrieve(queries, bundle, log);
    if (candidates.length === 0) throw new Error('YouTube returned no usable videos');
    const shortlist = candidates.slice(0, CANDIDATES_TO_JUDGE);
    log?.(`${candidates.length} candidates, judging ${shortlist.length}`);

    for (const c of shortlist) await ensureVideoRow(c);

    // Skip pairs already judged for every bundle skill.
    const { rows: judgedRows } = await pool.query(
      'SELECT video_id, skill_id FROM video_coverage WHERE video_id = ANY($1) AND skill_id = ANY($2)',
      [shortlist.map((c) => c.videoId), bundle.map((b) => b.id)],
    );
    const judgedPairs = new Set(judgedRows.map((r) => `${r.video_id}|${r.skill_id}`));
    const toJudge = shortlist.filter((c) => !bundle.every((b) => judgedPairs.has(`${c.videoId}|${b.id}`)));
    log?.(`${shortlist.length - toJudge.length} already judged, ${toJudge.length} to judge`);

    await mapLimit(toJudge, JUDGE_CONCURRENCY, async (c) => {
      const transcript = await ensureTranscript(c.videoId);
      const judgement = await judgeVideo(c, transcript, bundle);
      if (judgement) await persistJudgement(c.videoId, judgement);
    });

    await pool.query(
      `UPDATE skills SET video_search_status = 'done', video_searched_at = now(), video_search_error = NULL, updated_at = now() WHERE id = $1`,
      [skillId],
    );
    return rankVideos({ skillIds: [skillId] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(`UPDATE skills SET video_search_status = 'error', video_search_error = $1, updated_at = now() WHERE id = $2`, [
      message.slice(0, 500),
      skillId,
    ]);
    throw err;
  }
}

// ── Ranking (read model) ────────────────────────────────────────────────────

interface CoverageRow {
  video_id: string;
  skill_id: string;
  coverage: number;
  confidence: number;
  objectives_covered: unknown;
  start_seconds: number | null;
  end_seconds: number | null;
  reason: string;
  label: string;
  mastery: Mastery;
}

interface VideoRow {
  id: string;
  title: string;
  channel: string;
  duration_seconds: number;
  url: string;
  summary: string;
  level: string;
  focus: number;
  quality: number;
  transcript_status: string;
  watched_at: string | null;
}

/**
 * Rank judged videos for the learner. `skillIds` restricts to videos that
 * cover at least one of those skills (≥ floor); omit it for the global plan.
 * Learned milestones still appear on a video but barely count toward its
 * value — the learner's time should go to what is still unknown.
 */
export async function rankVideos(
  opts: { skillIds?: string[]; videoIds?: string[]; limit?: number; includeLearned?: boolean } = {},
): Promise<RankedVideo[]> {
  const params: unknown[] = [COVERAGE_FLOOR];
  let videoFilter = '';
  if (opts.skillIds?.length) {
    params.push(opts.skillIds);
    videoFilter += ` AND vc.video_id IN (SELECT video_id FROM video_coverage WHERE skill_id = ANY($${params.length}) AND coverage >= $1)`;
  }
  if (opts.videoIds?.length) {
    params.push(opts.videoIds);
    videoFilter += ` AND vc.video_id = ANY($${params.length})`;
  }
  const { rows: covRows } = await pool.query(
    `SELECT vc.*, k.label, k.mastery
     FROM video_coverage vc JOIN skills k ON k.id = vc.skill_id
     WHERE vc.coverage >= $1 ${videoFilter}`,
    params,
  );
  const coverage = covRows as CoverageRow[];
  if (coverage.length === 0) return [];

  const videoIds = [...new Set(coverage.map((c) => c.video_id))];
  const skillIds = [...new Set(coverage.map((c) => c.skill_id))];
  const [{ rows: videoRows }, { rows: courseRows }] = await Promise.all([
    pool.query('SELECT * FROM videos WHERE id = ANY($1)', [videoIds]),
    pool.query(
      `SELECT s.skill_id, r.course_id, c.name AS course_name, s.id AS step_id
       FROM roadmap_steps s JOIN roadmaps r ON r.id = s.roadmap_id JOIN courses c ON c.id = r.course_id
       WHERE s.skill_id = ANY($1)`,
      [skillIds],
    ),
  ]);
  const coursesBySkill = new Map<string, Array<{ courseId: string; courseName: string; stepId: string }>>();
  for (const r of courseRows) {
    const list = coursesBySkill.get(r.skill_id) ?? [];
    list.push({ courseId: r.course_id, courseName: r.course_name, stepId: r.step_id });
    coursesBySkill.set(r.skill_id, list);
  }
  const covByVideo = new Map<string, CoverageRow[]>();
  for (const c of coverage) {
    const list = covByVideo.get(c.video_id) ?? [];
    list.push(c);
    covByVideo.set(c.video_id, list);
  }

  const ranked: RankedVideo[] = [];
  for (const v of videoRows as VideoRow[]) {
    const rows = covByVideo.get(v.id) ?? [];
    const milestones: VideoMilestone[] = rows
      .map((c) => ({
        skillId: c.skill_id,
        label: c.label,
        coverage: Number(c.coverage),
        confidence: Number(c.confidence),
        mastery: c.mastery,
        courses: coursesBySkill.get(c.skill_id) ?? [],
        objectivesCovered: strArr(c.objectives_covered),
        startSeconds: c.start_seconds,
        endSeconds: c.end_seconds,
        reason: c.reason,
      }))
      .sort((a, b) => b.coverage - a.coverage);

    let value = 0;
    let unlearned = 0;
    const touched = new Set<string>();
    for (const m of milestones) {
      const demand = Math.max(1, m.courses.length);
      const weight = m.coverage * (0.5 + 0.5 * m.confidence);
      const learnedPenalty = m.mastery === 'learned' ? 0.15 : 1;
      value += weight * demand * learnedPenalty;
      if (m.mastery !== 'learned') {
        unlearned++;
        for (const c of m.courses) touched.add(c.courseId);
      }
    }
    if (unlearned > 1) value *= 1 + 0.15 * (unlearned - 1); // covering several milestones in one sitting
    if (!opts.includeLearned && unlearned === 0) continue;

    const minutes = Math.max(3, v.duration_seconds / 60);
    const efficiency = value / Math.pow(minutes, 0.6);
    const focus = Number(v.focus) || 0.5;
    const quality = Number(v.quality) || 0.5;
    const score = efficiency * (0.6 + 0.4 * focus) * (0.7 + 0.3 * quality);

    ranked.push({
      id: v.id,
      title: v.title,
      channel: v.channel,
      durationSeconds: v.duration_seconds,
      url: v.url,
      thumbnail: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
      summary: v.summary,
      level: v.level,
      focus,
      quality,
      transcriptStatus: v.transcript_status,
      watchedAt: v.watched_at,
      milestones,
      unlearnedMilestones: unlearned,
      coursesTouched: touched.size,
      minutesPerMilestone: Math.round((minutes / Math.max(1, unlearned || milestones.length)) * 10) / 10,
      score: Math.round(score * 1000) / 1000,
    });
  }
  ranked.sort((a, b) => b.score - a.score);
  return opts.limit ? ranked.slice(0, opts.limit) : ranked;
}

/**
 * Curate a subject's watch list to at most `cap` videos (default 3) that
 * TOGETHER cover the material. The judge pool reliably contains near-duplicates
 * — five "intro to X" videos that each teach the same objectives — and listing
 * all of them wastes the learner's time. So a video only earns a slot if it
 * still teaches something the earlier picks do not: each unlearned milestone
 * contributes its objectivesCovered (or, when the judge listed none, the
 * milestone id itself) to a seen-set, and a candidate whose fresh contribution
 * is empty is dropped as a repeat. Score order breaks ties, so the strongest
 * video always leads. Degenerate case — everything already learned, so nothing
 * is "fresh" — falls back to the plain top `cap` (old behaviour).
 */
export function selectSubjectVideos(videos: RankedVideo[], cap = 3): RankedVideo[] {
  const scored = [...videos].sort((a, b) => b.score - a.score);
  if (scored.length <= cap) return scored;
  const seen = new Set<string>();
  const picked: RankedVideo[] = [];
  for (const v of scored) {
    if (picked.length >= cap) break;
    // Objectives are qualified by skillId: some roadmaps carry placeholder
    // objective text ("objective 1") shared across milestones, and a raw
    // string set would wrongly mark different milestones as duplicates.
    const fresh = v.milestones
      .filter((m) => m.mastery !== 'learned' && m.coverage >= COVERAGE_FLOOR)
      .flatMap((m) => (m.objectivesCovered.length > 0 ? m.objectivesCovered : [m.skillId]).map((o) => `${m.skillId}::${o}`))
      .filter((o) => !seen.has(o));
    if (v.milestones.length > 0 && fresh.length === 0) continue; // pure repeat of an earlier pick
    for (const o of fresh) seen.add(o);
    picked.push(v);
  }
  return picked.length > 0 ? picked : scored.slice(0, cap);
}
