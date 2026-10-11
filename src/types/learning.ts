/**
 * Learning suite — roadmaps, skills, activities and the learner profile.
 * Mirrors the server responses in `server/routes/roadmaps.ts` and
 * `server/routes/learning.ts`.
 */

export type Mastery = 'not_started' | 'learning' | 'learned';

export type ActivityKind = 'lesson' | 'quiz' | 'flashcards' | 'discussion' | 'recall' | 'podcast' | 'diagram' | 'slides' | 'flow';

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
  /** All versions of this course's roadmap (active first) — for the switcher. */
  versions?: RoadmapVersion[];
}

/** One saved roadmap version in a course's switcher list. */
export interface RoadmapVersion {
  id: string;
  title: string;
  status: RoadmapStatus;
  isActive: boolean;
  createdAt: string;
  stepCount: number;
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

/** One slide of a generated deck. Every slide carries speaker `notes` — the
 *  spoken narration TTS reads aloud (also shown under the stage). */
export type Slide =
  | { type: 'title'; title: string; subtitle: string; notes: string }
  | { type: 'bullets'; title: string; bullets: string[]; notes: string }
  | { type: 'diagram'; title: string; caption: string; svg: string; notes: string };

export interface SlidesContent {
  /** The deck, in presentation order. */
  slides: Slide[];
  /** Storage key; set once the fire-and-forget narration render finishes. */
  audioPath?: string;
  /** Per-slide narration timing (seconds) — lets the player auto-advance. */
  slideAudio?: Array<{ startS: number; durationS: number }>;
  /** Set when the TTS render failed — the deck still reads fine. */
  renderError?: string;
}

export interface SlidesResult {
  score: number;
}

export interface DiagramContent {
  prompt: string;
  rubric: string[];
  hints: string[];
  /** Review-loop transcript (assistant feedback + snapshot markers). */
  messages: Array<{ role: 'assistant' | 'user'; content: string; at: string }>;
  maxRounds: number;
}

export type ActivityContent = LessonContent | QuizContent | FlashcardsContent | DiscussionContent | RecallContent | PodcastContent | DiagramContent | SlidesContent | FlowLessonContent | FlowQuizContent;

// ── Learning flow (Duolingo-style) ──────────────────────────────────────────

/** The 7-lesson sequence per topic, in order. */
export const FLOW_SLOTS = ['learn1', 'review1', 'review_prev', 'learn2', 'review2', 'review1b', 'test'] as const;
export type FlowSlot = (typeof FLOW_SLOTS)[number];

export const FLOW_SLOT_META: Record<FlowSlot, { label: string; blurb: string; kind: 'learn' | 'review' | 'test' }> = {
  learn1: { label: 'Learn · part 1', blurb: 'First half of this topic', kind: 'learn' },
  review1: { label: 'Review · part 1', blurb: 'Quick checks on what you just learned', kind: 'review' },
  review_prev: { label: 'Review · earlier topics', blurb: 'Keep previous topics fresh', kind: 'review' },
  learn2: { label: 'Learn · part 2', blurb: 'Second half of this topic', kind: 'learn' },
  review2: { label: 'Review · part 2', blurb: 'Quick checks on part 2', kind: 'review' },
  review1b: { label: 'Review · part 1 again', blurb: 'One more pass on part 1', kind: 'review' },
  test: { label: 'Final test', blurb: 'Everything on this topic', kind: 'test' },
};

export interface FlowSubject {
  id: string;
  title: string;
  explanation: string;
  example: string;
  /** Sanitized teaching SVG for the concept page (optional; older decks lack it). */
  diagram?: string;
  /** Sanitized teaching SVG for the example page. */
  exampleDiagram?: string;
  mcq: { prompt: string; options: string[]; correct: string; explanation: string };
}

export interface FlowLessonContent {
  flow: 'lesson';
  /** Which flow lesson this deck belongs to (stamped server-side). */
  slot?: FlowSlot;
  subjects: FlowSubject[];
}

export interface FlowQuizQuestion {
  id: string;
  subject: string;
  prompt: string;
  options: string[];
  correct: string;
  explanation: string;
}

export interface FlowQuizContent {
  flow: 'quiz';
  slot?: FlowSlot;
  questions: FlowQuizQuestion[];
}

/** Account-level teaching style, switched in Settings. */
export type LearningMode = 'legacy' | 'flow';

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

export interface DiagramResult {
  score: number;
  covered: string[];
  missing: string[];
  feedback: string;
  /** The final canvas snapshot (data URL), for the outcome view. */
  image?: string;
}

export type ActivityResult = QuizResult | FlashcardsResult | LessonResult | RecallResult | DiscussionResult | PodcastResult | DiagramResult | SlidesResult | FlowResult;

/** What a completed flow lesson records — per-subject right/wrong drives reviews. */
export interface FlowResult {
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  slot: FlowSlot;
}

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
  flow: { label: 'Guided lesson', blurb: 'Learn, review, and test — picked for you', xp: 20, emoji: '🎯', assessed: true },
  lesson: { label: 'Lesson', blurb: 'A short focused explainer with worked examples', xp: 10, emoji: '📖', assessed: false },
  slides: { label: 'Slides', blurb: 'A slideshow with diagrams, read aloud', xp: 10, emoji: '🖥️', assessed: false },
  flashcards: { label: 'Flashcards', blurb: 'Quick recall drill, grade yourself', xp: 15, emoji: '🃏', assessed: false },
  podcast: { label: 'Podcast', blurb: 'A two-host audio overview of this topic', xp: 15, emoji: '🎙️', assessed: false },
  quiz: { label: 'Quiz', blurb: 'Six questions, graded by the tutor', xp: 20, emoji: '✅', assessed: true },
  recall: { label: 'Teach it back', blurb: 'Explain it from memory, get a rubric review', xp: 25, emoji: '🗣️', assessed: true },
  discussion: { label: 'Talk it through', blurb: 'A Socratic chat until the tutor is convinced', xp: 30, emoji: '💬', assessed: true },
  diagram: { label: 'Draw a diagram', blurb: 'Sketch the concept; the tutor reviews your drawing', xp: 25, emoji: '✏️', assessed: true },
};

/**
 * The strategies grouped into the three-stage learning flow (learn → test →
 * demonstrate). Drives the picker's grouping and generate-all's queue order:
 * the natural first stops (Learn) are ready first, Demonstrate last.
 */
export interface StrategyStage {
  /** 1-based display order. */
  n: 1 | 2 | 3;
  label: string;
  hint: string;
  kinds: ActivityKind[];
}

export const STRATEGY_STAGES: readonly StrategyStage[] = [
  { n: 1, label: 'Learn', hint: 'First pass — take it in', kinds: ['lesson', 'slides', 'podcast'] },
  { n: 2, label: 'Test', hint: 'Find out what stuck', kinds: ['flashcards', 'quiz'] },
  { n: 3, label: 'Demonstrate', hint: 'Assessed — these move mastery', kinds: ['recall', 'discussion', 'diagram'] },
];

export const MASTERY_LABEL: Record<Mastery, string> = {
  not_started: 'Not started',
  learning: 'In progress',
  learned: 'Learned',
};

/** Map server mastery onto the topic map's numeric scale (0 · 1 · 2). */
export const masteryLevel = (m: Mastery): 0 | 1 | 2 => (m === 'learned' ? 2 : m === 'learning' ? 1 : 0);
