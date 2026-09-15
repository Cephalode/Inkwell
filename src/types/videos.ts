/**
 * Topic videos — YouTube videos judged against roadmap milestones (skills),
 * ranked to waste as little of the learner's time as possible. Mirrors
 * `server/src/videoSearch.ts` and `server/routes/videos.ts`.
 */
import type { Mastery } from './learning';

export type VideoSearchStatus = 'none' | 'searching' | 'done' | 'error';

export interface VideoMilestone {
  skillId: string;
  label: string;
  /** 0..1 fraction of the milestone's objectives the video teaches. */
  coverage: number;
  confidence: number;
  mastery: Mastery;
  /** Every course (and its step) that teaches this milestone. */
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
  /** Milestones covered that the learner has NOT learned yet. */
  unlearnedMilestones: number;
  coursesTouched: number;
  minutesPerMilestone: number;
  /** Time-efficiency score; higher = more unlearned milestones per minute. */
  score: number;
}

export interface VideoDetail extends RankedVideo {
  transcriptExcerpt: string;
}

export interface SkillSearchInfo {
  id: string;
  label: string;
  mastery: Mastery;
  searchStatus: VideoSearchStatus;
  searchedAt: string | null;
  searchError: string | null;
}

export interface SkillVideos {
  skill: SkillSearchInfo;
  videos: RankedVideo[];
  cached?: boolean;
  log?: string[];
}

export interface PlanMilestone {
  skillId: string;
  label: string;
  mastery: Mastery;
  courses: Array<{ courseId: string; courseName: string; stepId: string; position: number }>;
  searchStatus: VideoSearchStatus;
  searchedAt: string | null;
  searchError: string | null;
  bestVideoId: string | null;
  videoCount: number;
}

export interface VideoPlan {
  /** Unlearned milestones, most-shared first. */
  milestones: PlanMilestone[];
  /** Judged videos that still teach something unlearned, best value first. */
  videos: RankedVideo[];
  stats: { unlearned: number; shared: number; searched: number; searching: number; videos: number };
}

export interface WatchedResponse {
  video: RankedVideo;
  skills: Array<{ skillId: string; label: string; mastery: Mastery; masteryScore: number; previous: Mastery }>;
  xpGained: number;
  profile: import('./learning').LearnerProfile;
}

/** Which roadmap milestones a document feeds (`GET /learning/document-usage`). */
export type DocumentUsage = Record<
  string,
  Array<{ stepId: string; stepTitle: string; courseId: string; courseName: string; mastery: Mastery }>
>;

export const formatDuration = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

/** "Covers 3 milestones across 2 courses · 14 min" */
export const videoValueLine = (v: RankedVideo): string => {
  const n = v.unlearnedMilestones || v.milestones.length;
  const parts = [`${n} milestone${n === 1 ? '' : 's'}`];
  if (v.coursesTouched > 1) parts.push(`across ${v.coursesTouched} courses`);
  return `${parts.join(' ')} · ${Math.round(v.durationSeconds / 60)} min`;
};
