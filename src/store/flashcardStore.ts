import { create } from 'zustand';
import type { FlashcardDeck, Flashcard } from '../types/flashcards';
import {
  reduceGenerationEvent,
  initialProgress,
  type GenerationEvent,
  type GenerationProgress,
} from '../types/generation';
import * as api from '../services/api/client';
import { consumeSSE } from '../utils/sse';

interface FlashcardState {
  decks: FlashcardDeck[];
  cardsByDeckId: Record<string, Flashcard[]>;
  generationProgress: Record<string, GenerationProgress>;

  // Actions
  fetchDecks: () => Promise<void>;
  fetchDeck: (deckId: string) => Promise<void>;
  fetchCards: (deckId: string) => Promise<void>;
  createDeck: (params: {
    title: string;
    description?: string;
    course_id?: string;
    source: { type: 'course' | 'document' | 'chapter'; ids: string[] };
  }) => Promise<FlashcardDeck>;
  generateDeck: (deckId: string, signal?: AbortSignal) => Promise<void>;
  reviewCard: (cardId: string, correct: boolean) => Promise<void>;
  deleteDeck: (deckId: string) => Promise<void>;
  setGenerationProgress: (deckId: string, progress: GenerationProgress) => void;
  clearGenerationProgress: (deckId: string) => void;
}

export const useFlashcardStore = create<FlashcardState>((set, get) => ({
  decks: [],
  cardsByDeckId: {},
  generationProgress: {},

  fetchDecks: async () => {
    try {
      const decks = await api.listFlashcardDecks();
      set({ decks });
    } catch (error) {
      console.error('Error fetching flashcard decks:', error);
      throw error;
    }
  },

  fetchDeck: async (deckId: string) => {
    try {
      const deck = await api.getFlashcardDeck(deckId);
      set((state) => ({
        decks: state.decks.some((d) => d.id === deckId)
          ? state.decks.map((d) => (d.id === deckId ? deck : d))
          : [deck, ...state.decks],
      }));
    } catch (error) {
      console.error('Error fetching flashcard deck:', error);
    }
  },

  fetchCards: async (deckId: string) => {
    try {
      const cards = await api.getFlashcardDeckCards(deckId);
      set((state) => ({
        cardsByDeckId: {
          ...state.cardsByDeckId,
          [deckId]: cards,
        },
      }));
    } catch (error) {
      console.error('Error fetching flashcard cards:', error);
      throw error;
    }
  },

  createDeck: async (params) => {
    try {
      const deck = await api.createFlashcardDeck(params);
      set((state) => ({
        decks: [deck, ...state.decks],
      }));
      return deck;
    } catch (error) {
      console.error('Error creating flashcard deck:', error);
      throw error;
    }
  },

  generateDeck: async (deckId: string, signal?: AbortSignal) => {
    try {
      set((state) => ({
        generationProgress: {
          ...state.generationProgress,
          [deckId]: { ...initialProgress, stage: 'collecting' },
        },
      }));

      const response = await api.generateFlashcardDeck(deckId, signal);
      await consumeSSE<GenerationEvent>(response, (event) => {
        set((state) => {
          const prev = state.generationProgress[deckId] ?? initialProgress;
          return {
            generationProgress: {
              ...state.generationProgress,
              [deckId]: reduceGenerationEvent(prev, event),
            },
          };
        });
      });

      // Refresh deck info and cards
      await Promise.all([get().fetchDeck(deckId), get().fetchCards(deckId)]);

      set((state) => {
        const rest = { ...state.generationProgress };
        delete rest[deckId];
        return { generationProgress: rest };
      });
    } catch (error) {
      console.error('Error generating flashcard deck:', error);
      set((state) => ({
        generationProgress: {
          ...state.generationProgress,
          [deckId]: {
            stage: 'error',
            itemsGenerated: state.generationProgress[deckId]?.itemsGenerated ?? 0,
            error: String(error),
          },
        },
      }));
    }
  },

  reviewCard: async (cardId: string, correct: boolean) => {
    try {
      const card = await api.reviewFlashcard(cardId, correct);
      set((state) => {
        const updatedByDeck = { ...state.cardsByDeckId };
        for (const deckId in updatedByDeck) {
          updatedByDeck[deckId] = updatedByDeck[deckId].map((c) =>
            c.id === cardId ? card : c
          );
        }
        return { cardsByDeckId: updatedByDeck };
      });
    } catch (error) {
      console.error('Error reviewing card:', error);
    }
  },

  deleteDeck: async (deckId: string) => {
    try {
      await api.deleteFlashcardDeck(deckId);
      set((state) => {
        const cardsByDeckId = { ...state.cardsByDeckId };
        delete cardsByDeckId[deckId];
        return {
          decks: state.decks.filter((d) => d.id !== deckId),
          cardsByDeckId,
        };
      });
    } catch (error) {
      console.error('Error deleting flashcard deck:', error);
      throw error;
    }
  },

  setGenerationProgress: (deckId: string, progress: GenerationProgress) => {
    set((state) => ({
      generationProgress: {
        ...state.generationProgress,
        [deckId]: progress,
      },
    }));
  },

  clearGenerationProgress: (deckId: string) => {
    set((state) => {
      const rest = { ...state.generationProgress };
      delete rest[deckId];
      return { generationProgress: rest };
    });
  },
}));
