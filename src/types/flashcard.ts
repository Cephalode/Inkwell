export interface Flashcard {
  id: string;
  documentId: string;
  deck: string;
  front: string;
  back: string;
  difficulty: 'easy' | 'medium' | 'hard';
  // SM-2 spaced repetition fields
  easeFactor: number; // default 2.5
  interval: number; // days
  repetitions: number;
  nextReview: number; // timestamp
  lastReview: number | null; // timestamp
  reviewCount: number;
  createdAt: number;
}

export interface FlashcardDeckInfo {
  id: string;
  name: string;
  documentId: string;
  cardCount: number;
  dueCount: number;
  masteredCount: number;
  createdAt: number;
}
