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

export interface GenerationProgress {
  stage: 'collecting' | 'materials_collected' | 'generating' | 'synthesizing' | 'done';
  materialsCount?: number;
  currentMaterial?: { id: string; title: string };
  cardsGenerated?: number;
  error?: string;
}
