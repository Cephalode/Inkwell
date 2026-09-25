export type QuestionType = 'mcq' | 'true_false' | 'short_answer';

export interface TestQuestion {
  id: string;
  test_id: string;
  position: number;
  qtype: QuestionType;
  prompt: string;
  options?: string[];
  correct_answer?: string | boolean;
  explanation?: string;
  hint?: string;
  topic?: string;
}

/** Question shape in take mode — correct_answer and explanation are omitted. */
export type TestQuestionForTaking = Omit<TestQuestion, 'correct_answer' | 'explanation'>;

export interface TestConfig {
  numQuestions?: number;
  types?: QuestionType[];
  instructions?: string;
}

export interface PracticeTest {
  id: string;
  title: string;
  description: string;
  course_id?: string;
  source: {
    type: 'course' | 'document' | 'chapter';
    ids: string[];
  };
  config: TestConfig;
  status: 'pending' | 'generating' | 'done' | 'error';
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface PracticeTestWithQuestions extends PracticeTest {
  questions: (TestQuestion | TestQuestionForTaking)[];
}

export interface GradedAnswer {
  studentAnswer: string;
  isCorrect: boolean;
  feedback: string;
  pointsAwarded: number;
}

export interface TestAttempt {
  id: string;
  test_id: string;
  answers: Record<string, GradedAnswer>;
  score: number;
  started_at: string;
  completed_at?: string;
}

export interface TestAttemptResult {
  attempt: TestAttempt;
  score: number;
  gradedAnswers: Record<string, GradedAnswer>;
  totalQuestions: number;
}

// GenerationProgress now lives in a single shared module so both the flashcard
// and practice-test pipelines use one type + one SSE-event reducer.
export type { GenerationProgress, GenerationStage } from './generation';
export { reduceGenerationEvent, initialProgress } from './generation';
export type { GenerationEvent } from './generation';
