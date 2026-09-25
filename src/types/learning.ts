/**
 * Learning suite — roadmaps, skills, activities and the learner profile.
 * Mirrors the server responses in `server/routes/roadmaps.ts` and
 * `server/routes/learning.ts`.
 */

export type Mastery = 'not_started' | 'learning' | 'learned';

export type ActivityKind = 'lesson' | 'quiz' | 'flashcards' | 'discussion' | 'recall' | 'podcast';

export type ActivityStatus = 'ready' | 'in_progress' | 'completed' | 'error';

/** learned · current (recommended next) · available · locked (unmet prerequisites) */
export type StepState = 'learned' | 'current' | 'available' | 'locked';

export type RoadmapStatus = 'pending' | 'generating' | 'done' | 'error';

export interface Skill {
  id: string;
  slug: string;
  label: string;
  description: string;
  mastery: Mastery;
  /** 0..1 rolling confidence derived from the evidence trail. */
  masteryScore: number;
  learnedAt: string | null;
}

export interface SkillWithCourses extends Skill {
  courses: Array<{ courseId: string; courseName: string; stepId: string; roadmapId: string; position: number }>;
}

export interface SourceRef {
  documentId: string;
  chapterId?: string;
  title: string;
}

export interface ActivitySummary {
  id: string;
  kind: ActivityKind;
  status: ActivityStatus;
  score: number | null;
  completedAt: string | null;
  createdAt: string;
}

export interface RoadmapStep {
  id: string;
  roadmapId: string;
  skillId: string;
  position: number;
  title: string;
  description: string;
  objectives: string[];
  keyPoints: string[];
  /** Step ids (same roadmap) this step builds on. */
  dependsOn: string[];
  sourceRefs: SourceRef[];
  estimatedMinutes: number;
  skill: Skill;
  state: StepState;
  activities: ActivitySummary[];
  /** Other courses whose roadmap teaches the same skill. */
  alsoIn: Array<{ courseId: string; courseName: string; stepId: string }>;
}

export interface Roadmap {
  id: string;
  courseId: string;
  title: string;
  overview: string;
  status: RoadmapStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  steps: RoadmapStep[];
  nextStepId: string | null;
  counts: { total: number; learned: number; learning: number; locked: number };
}

// ── Activity content ────────────────────────────────────────────────────────

export interface LessonContent {
  markdown: string;
  checkpoints: Array<{ question: string; answer: string }>;
  estimatedMinutes: number;
}

export type QuizQuestionType = 'mcq' | 'true_false' | 'short_answer';

export interface QuizQuestion {
  id: string;
  qtype: QuizQuestionType;
  prompt: string;
  options?: string[];
  /** Only present once the quiz has been submitted. */
  correctAnswer?: string | boolean;
  explanation?: string;
  objective?: string;
}

export interface QuizContent {
  questions: QuizQuestion[];
  passScore: number;
}

export interface FlashcardsContent {
  cards: Array<{ id: string; front: string; back: string }>;
}

export interface DiscussionAssessment {
  verdict: 'learned' | 'progressing' | 'struggling';
  confidence: number;
  coveredObjectives: string[];
  gaps: string[];
}

export interface DiscussionMessage {
  role: 'assistant' | 'user';
  content: string;
  assessment?: DiscussionAssessment;
  at: string;
}

export interface DiscussionContent {
  messages: DiscussionMessage[];
  closed: boolean;
  maxTurns: number;
}

export interface RecallContent {
  prompt: string;
  rubric: string[];
  hints: string[];
}

export interface PodcastContent {
  title: string;
  lines: Array<{ speaker: 'host' | 'guest'; text: string }>;
  /** Storage key; set once the fire-and-forget TTS render finishes. */
  audioPath?: string;
  /** Set when the TTS render failed — the transcript still reads fine. */
  renderError?: string;
}

export type ActivityContent = LessonContent | QuizContent | FlashcardsContent | DiscussionContent | RecallContent | PodcastContent;

// ── Activity results ────────────────────────────────────────────────────────

export interface GradedQuizAnswer {
  questionId: string;
  studentAnswer: string;
  isCorrect: boolean;
  points: number;
  feedback: string;
}

export interface QuizResult {
  score: number;
  passed: boolean;
  graded: GradedQuizAnswer[];
}

export interface FlashcardsResult {
  score: number;
  correct: number;
  total: number;
}

export interface LessonResult {
  score: number;
  checkpointsCorrect: number;
  total: number;
}

export interface RecallResult {
  score: number;
  covered: string[];
  missing: string[];
  feedback: string;
  answer: string;
}

export interface DiscussionResult extends DiscussionAssessment {
  score: number;
  turns: number;
}

/** Podcasts aren't graded — completing one is the whole result. */
export interface PodcastResult {
  score: number;
}

export type ActivityResult = QuizResult | FlashcardsResult | LessonResult | RecallResult | DiscussionResult | PodcastResult;

export interface LearningActivity {
  id: string;
  stepId: string;
  kind: ActivityKind;
  status: ActivityStatus;
  content: ActivityContent | null;
  result: ActivityResult | null;
  score: number | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

// ── Learner profile & responses ─────────────────────────────────────────────

export interface LearnerProfile {
  xp: number;
  xpToday: number;
  streak: number;
  longestStreak: number;
  dailyGoalXp: number;
  lastActiveOn: string | null;
  goalHitToday: boolean;
}

/** Response of `POST /learning-activities/:id/submit` (and a closing discussion turn). */
export interface SubmitResponse {
  activity: LearningActivity;
  skill: Skill;
  previousMastery: Mastery;
  justLearned: boolean;
  xpGained: number;
  profile: LearnerProfile;
}

/** Response of `POST /learning-activities/:id/messages`. */
export interface DiscussionTurnResponse extends Partial<SubmitResponse> {
  activity: LearningActivity;
  assessment: DiscussionAssessment;
  done: boolean;
}

export interface SkillEvidence {
  id: string;
  kind: ActivityKind | 'video' | 'manual';
  score: number;
  weight: number;
  note: string;
  createdAt: string;
  courseId: string | null;
  courseName: string | null;
}

/** `GET /roadmap-steps/:id` — a roadmap step with everything the step page needs. */
export interface StepDetail extends Omit<RoadmapStep, 'activities'> {
  courseId: string;
  courseName: string;
  /** The roadmap's recommended next step (may be this one). */
  roadmapNextStepId: string | null;
  prevStepId: string | null;
  nextStepId: string | null;
  dependsOnTitles: string[];
  activities: LearningActivity[];
  evidence: SkillEvidence[];
}

export interface CourseProgress {
  courseId: string;
  courseName: string;
  isCurrent: boolean;
  roadmapId: string | null;
  status: RoadmapStatus | null;
  total: number;
  learned: number;
  learning: number;
  nextStep: { id: string; title: string; estimatedMinutes: number } | null;
}

export interface LearningOverview {
  profile: LearnerProfile;
  courses: CourseProgress[];
  skillsTotal: number;
  skillsLearned: number;
  skillsLearning: number;
  activitiesCompleted: number;
  activitiesCompletedToday: number;
  recentlyLearned: Skill[];
  reviewSuggestions: Array<{ skill: Skill; stepId: string | null; courseName: string | null }>;
}

// ── Display metadata (shared by every learning surface) ─────────────────────

export const ACTIVITY_META: Record<
  ActivityKind,
  { label: string; blurb: string; xp: number; emoji: string; assessed: boolean }
> = {
  lesson: { label: 'Lesson', blurb: 'A short focused explainer with worked examples', xp: 10, emoji: '📖', assessed: false },
  flashcards: { label: 'Flashcards', blurb: 'Quick recall drill, grade yourself', xp: 15, emoji: '🃏', assessed: false },
  podcast: { label: 'Podcast', blurb: 'A two-host audio overview of this topic', xp: 15, emoji: '🎙️', assessed: false },
  quiz: { label: 'Quiz', blurb: 'Six questions, graded by the tutor', xp: 20, emoji: '✅', assessed: true },
  recall: { label: 'Teach it back', blurb: 'Explain it from memory, get a rubric review', xp: 25, emoji: '🗣️', assessed: true },
  discussion: { label: 'Talk it through', blurb: 'A Socratic chat until the tutor is convinced', xp: 30, emoji: '💬', assessed: true },
};

export const MASTERY_LABEL: Record<Mastery, string> = {
  not_started: 'Not started',
  learning: 'In progress',
  learned: 'Learned',
};

/** Map server mastery onto the topic map's numeric scale (0 · 1 · 2). */
export const masteryLevel = (m: Mastery): 0 | 1 | 2 => (m === 'learned' ? 2 : m === 'learning' ? 1 : 0);
