import { create } from 'zustand';
import { Flashcard, FlashcardDeckInfo } from '../types/flashcard';
import { applySM2, UserRating } from '../services/spacedRepetition';
import {
  saveFlashcard,
  saveFlashcards,
  getAllFlashcards,
  getDueFlashcards,
  deleteFlashcard,
} from '../services/storage/flashcardStore';

interface FlashcardState {
  flashcards: Flashcard[];
  dueCards: Flashcard[];
  decks: FlashcardDeckInfo[];
  currentDeck: string | null;
  currentIndex: number;
  isFlipped: boolean;
  isReviewMode: boolean;
  isLoaded: boolean;

  // Actions
  setFlashcards: (cards: Flashcard[]) => void;
  addFlashcards: (cards: Flashcard[]) => void;
  setCurrentDeck: (deck: string | null) => void;
  nextCard: () => void;
  prevCard: () => void;
  flipCard: () => void;
  updateCard: (id: string, updates: Partial<Flashcard>) => void;
  removeCard: (id: string) => void;
  setReviewMode: (mode: boolean) => void;

  // Persistence + SM-2
  loadFromStorage: () => Promise<void>;
  reviewCard: (cardId: string, rating: UserRating) => Promise<void>;
  deleteCard: (cardId: string) => Promise<void>;
}

export const useFlashcardStore = create<FlashcardState>()((set, get) => ({
  flashcards: [],
  dueCards: [],
  decks: [],
  currentDeck: null,
  currentIndex: 0,
  isFlipped: false,
  isReviewMode: false,
  isLoaded: false,

  setFlashcards: (cards) => set({ flashcards: cards }),
  addFlashcards: (cards) =>
    set((s) => ({ flashcards: [...s.flashcards, ...cards] })),
  setCurrentDeck: (deck) => set({ currentDeck: deck, currentIndex: 0 }),
  nextCard: () =>
    set((s) => ({ currentIndex: s.currentIndex + 1, isFlipped: false })),
  prevCard: () =>
    set((s) => ({
      currentIndex: Math.max(0, s.currentIndex - 1),
      isFlipped: false,
    })),
  flipCard: () => set((s) => ({ isFlipped: !s.isFlipped })),
  updateCard: (id, updates) =>
    set((s) => ({
      flashcards: s.flashcards.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),
  removeCard: (id) =>
    set((s) => ({
      flashcards: s.flashcards.filter((c) => c.id !== id),
      dueCards: s.dueCards.filter((c) => c.id !== id),
    })),
  setReviewMode: (mode) => set({ isReviewMode: mode, currentIndex: 0, isFlipped: false }),

  loadFromStorage: async () => {
    try {
      const allCards = await getAllFlashcards();
      const due = await getDueFlashcards();
      const decks = buildDeckSummary(allCards);
      set({
        flashcards: allCards,
        dueCards: due,
        decks,
        isLoaded: true,
      });
    } catch {
      set({ isLoaded: true });
    }
  },

  reviewCard: async (cardId, rating) => {
    const state = get();
    const card = state.flashcards.find((c) => c.id === cardId);
    if (!card) return;

    const sm2 = applySM2(card, rating);
    const updated: Flashcard = {
      ...card,
      ...sm2,
      difficulty: rating,
      reviewCount: (card.reviewCount ?? 0) + 1,
    };

    // Update local state
    const newFlashcards = state.flashcards.map((c) =>
      c.id === cardId ? updated : c,
    );
    const newDueCards = state.dueCards.filter((c) => c.id !== cardId);
    const decks = buildDeckSummary(newFlashcards);
    set({
      flashcards: newFlashcards,
      dueCards: newDueCards,
      decks,
    });

    // Persist
    try {
      await saveFlashcard(updated);
    } catch {
      // silently fail
    }
  },

  deleteCard: async (cardId) => {
    get().removeCard(cardId);
    try {
      await deleteFlashcard(cardId);
    } catch {
      // silently fail
    }
  },
}));

/** Build deck summary from flat card list */
function buildDeckSummary(cards: Flashcard[]): FlashcardDeckInfo[] {
  const now = Date.now();
  const deckMap = new Map<
    string,
    { name: string; documentId: string; cards: Flashcard[]; createdAt: number }
  >();

  for (const card of cards) {
    const key = card.deck;
    if (!deckMap.has(key)) {
      deckMap.set(key, {
        name: card.deck,
        documentId: card.documentId,
        cards: [],
        createdAt: card.createdAt,
      });
    }
    deckMap.get(key)!.cards.push(card);
  }

  const decks: FlashcardDeckInfo[] = [];
  for (const [name, info] of deckMap) {
    const cardCount = info.cards.length;
    const dueCount = info.cards.filter((c) => c.nextReview <= now).length;
    // "Mastered" = reviewed 5+ times and not currently due
    const masteredCount = info.cards.filter(
      (c) => (c.reviewCount ?? 0) >= 5 && c.nextReview > now,
    ).length;
    decks.push({
      id: name,
      name,
      documentId: info.documentId,
      cardCount,
      dueCount,
      masteredCount,
      createdAt: info.createdAt,
    });
  }

  return decks.sort((a, b) => b.createdAt - a.createdAt);
}

/** Helper: save generated cards to both state and IndexedDB */
export async function persistNewFlashcards(
  cards: Flashcard[],
): Promise<void> {
  const store = useFlashcardStore.getState();
  store.addFlashcards(cards);
  try {
    await saveFlashcards(cards);
    // Reload to refresh decks and due cards
    await store.loadFromStorage();
  } catch {
    // silently fail
  }
}
