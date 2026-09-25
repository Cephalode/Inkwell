export interface ReviewStats {
  timesReviewed: number;
  timesCorrect: number;
  lastReviewedAt?: string;
}

export interface Flashcard {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  position: number;
  review_stats: ReviewStats;
  created_at: string;
  updated_at: string;
}

export interface FlashcardDeck {
  id: string;
  title: string;
  description: string;
  course_id?: string;
  config?: { count?: number; instructions?: string };
  source: {
    type: 'course' | 'document' | 'chapter';
    ids: string[];
  };
  status: 'pending' | 'generating' | 'done' | 'error';
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface FlashcardDeckWithCards extends FlashcardDeck {
  cards?: Flashcard[];
}

// GenerationProgress now lives in a single shared module so both the flashcard
// and practice-test pipelines use one type + one SSE-event reducer.
export type { GenerationProgress, GenerationStage } from './generation';
export { reduceGenerationEvent, initialProgress } from './generation';
export type { GenerationEvent } from './generation';
