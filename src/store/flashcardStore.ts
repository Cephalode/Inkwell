import { create } from 'zustand';
import { Flashcard } from '../types/flashcard';

interface FlashcardState {
  flashcards: Flashcard[];
  currentDeck: string | null;
  currentIndex: number;
  isFlipped: boolean;
  setFlashcards: (cards: Flashcard[]) => void;
  addFlashcards: (cards: Flashcard[]) => void;
  setCurrentDeck: (deck: string | null) => void;
  nextCard: () => void;
  prevCard: () => void;
  flipCard: () => void;
  updateCard: (id: string, updates: Partial<Flashcard>) => void;
  removeCard: (id: string) => void;
}

export const useFlashcardStore = create<FlashcardState>()((set) => ({
  flashcards: [],
  currentDeck: null,
  currentIndex: 0,
  isFlipped: false,
  setFlashcards: (cards) => set({ flashcards: cards }),
  addFlashcards: (cards) => set((s) => ({ flashcards: [...s.flashcards, ...cards] })),
  setCurrentDeck: (deck) => set({ currentDeck: deck, currentIndex: 0 }),
  nextCard: () => set((s) => ({ currentIndex: s.currentIndex + 1, isFlipped: false })),
  prevCard: () => set((s) => ({ currentIndex: Math.max(0, s.currentIndex - 1), isFlipped: false })),
  flipCard: () => set((s) => ({ isFlipped: !s.isFlipped })),
  updateCard: (id, updates) => set((s) => ({
    flashcards: s.flashcards.map((c) => (c.id === id ? { ...c, ...updates } : c)),
  })),
  removeCard: (id) => set((s) => ({ flashcards: s.flashcards.filter((c) => c.id !== id) })),
}));
