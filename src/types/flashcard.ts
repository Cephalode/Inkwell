export interface Flashcard {
  id: string;
  documentId: string;
  deck: string;
  front: string;
  back: string;
  difficulty: 'easy' | 'medium' | 'hard';
  nextReview: number;
  interval: number;
  easeFactor: number;
  reviewCount: number;
  createdAt: number;
}

export interface FlashcardDeck {
  id: string;
  name: string;
  documentId: string;
  cardCount: number;
  dueCount: number;
  createdAt: number;
}
