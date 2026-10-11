import { useCallback, useEffect, useRef, useState } from 'react';
import { useFlashcardStore } from '../store/flashcardStore';

export function useFlashcards() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decks = useFlashcardStore((state) => state.decks);
  const fetchDecks = useFlashcardStore((state) => state.fetchDecks);
  const loadRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        await fetchDecks();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load flashcards');
      } finally {
        setLoading(false);
      }
    };
    loadRef.current = load;
    load();
  }, [fetchDecks]);

  const refetch = useCallback(() => loadRef.current(), []);

  return { decks, loading, error, refetch };
}

export function useFlashcardDeck(deckId: string) {
  const [loading, setLoading] = useState(!!deckId);
  const [error, setError] = useState<string | null>(null);
  const cardsByDeckId = useFlashcardStore((state) => state.cardsByDeckId);
  const fetchCards = useFlashcardStore((state) => state.fetchCards);
  const fetchDeck = useFlashcardStore((state) => state.fetchDeck);
  const cards = cardsByDeckId[deckId] || [];

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch the deck too so direct navigation / refresh works
        await Promise.all([fetchDeck(deckId), fetchCards(deckId)]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load cards');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [deckId, fetchDeck, fetchCards]);

  return { cards, loading, error };
}

export function useFlashcardGeneration() {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationProgress = useFlashcardStore((state) => state.generationProgress);
  const generateDeck = useFlashcardStore((state) => state.generateDeck);
  const setGenerationProgress = useFlashcardStore((state) => state.setGenerationProgress);

  const generate = async (deckId: string) => {
    setGenerating(true);
    setError(null);

    try {
      await generateDeck(deckId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      setError(message);
      setGenerationProgress(deckId, {
        stage: 'error',
        itemsGenerated: 0,
        error: message,
      });
    } finally {
      setGenerating(false);
    }
  };

  return { generating, error, generationProgress, generate };
}
