import { useState, useEffect, useRef, useCallback } from 'react';
import FlashcardDeck from '../components/flashcards/FlashcardDeck';
import ExportImportPanel from '../components/flashcards/ExportImportPanel';
import Button from '../components/shared/Button';
import EmptyState from '../components/shared/EmptyState';
import Spinner from '../components/shared/Spinner';
import Badge from '../components/shared/Badge';
import { useFlashcardStore, persistNewFlashcards } from '../store/flashcardStore';
import { useDocumentStore } from '../store/documentStore';
import { useProgress } from '../hooks/useProgress';
import { chatCompletion } from '../services/ai/client';
import { FLASHCARD_PROMPT } from '../services/ai/prompts';
import { Flashcard } from '../types/flashcard';
import { generateUUID } from '../utils/uuid';
import { HiSwitchHorizontal } from 'react-icons/hi';

export default function FlashcardsPage() {
  const {
    flashcards,
    dueCards,
    decks,
    isReviewMode,
    isLoaded,
    loadFromStorage,
    setReviewMode,
    reviewCard,
    setFlashcards,
  } = useFlashcardStore();
  const documents = useDocumentStore((s) => s.documents);
  const { trackSession } = useProgress();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<string>('');
  const [showTransfer, setShowTransfer] = useState(false);
  const sessionStartRef = useRef<number>(Date.now());
  const cardsReviewedRef = useRef<number>(0);
  const sessionDocumentIdRef = useRef<string | null>(null);

  // Track when review mode starts
  useEffect(() => {
    if (isReviewMode) {
      sessionStartRef.current = Date.now();
      cardsReviewedRef.current = 0;
    }
  }, [isReviewMode]);

  // Flush session when review mode ends and cards were reviewed
  const flushSession = useCallback(() => {
    if (cardsReviewedRef.current > 0) {
      const durationSec = Math.round((Date.now() - sessionStartRef.current) / 1000);
      trackSession({
        id: generateUUID(),
        type: 'flashcard',
        documentId: sessionDocumentIdRef.current || undefined,
        duration: durationSec,
        date: Date.now(),
        metadata: { cardsReviewed: cardsReviewedRef.current },
      });
      cardsReviewedRef.current = 0;
    }
  }, [trackSession]);

  // Flush when leaving review mode
  useEffect(() => {
    if (!isReviewMode) {
      flushSession();
    }
  }, [isReviewMode, flushSession]);

  const handleRate = useCallback((id: string, diff: 'easy' | 'medium' | 'hard') => {
    // Track document ID from the first card reviewed
    if (cardsReviewedRef.current === 0) {
      const card = flashcards.find((c) => c.id === id);
      if (card) sessionDocumentIdRef.current = card.documentId;
    }
    reviewCard(id, diff);
    cardsReviewedRef.current += 1;
  }, [flashcards, reviewCard]);

  // Load persisted cards on mount
  useEffect(() => {
    if (!isLoaded) {
      loadFromStorage();
    }
  }, [isLoaded, loadFromStorage]);

  const handleGenerate = async () => {
    const doc = documents.find((d) => d.id === selectedDoc);
    if (!doc?.parsedText) return;
    setIsLoading(true);
    try {
      const result = await chatCompletion([
        { role: 'user', content: FLASHCARD_PROMPT(doc.parsedText, 15) },
      ]);
      const parsed = JSON.parse(result.match(/\[.*\]/s)?.[0] || '[]');
      const cards: Flashcard[] = parsed.map((c: any) => ({
        id: generateUUID(),
        documentId: doc.id,
        deck: doc.name,
        front: c.front,
        back: c.back,
        difficulty: 'medium' as const,
        nextReview: Date.now(),
        interval: 1,
        easeFactor: 2.5,
        repetitions: 0,
        lastReview: null,
        reviewCount: 0,
        createdAt: Date.now(),
      }));
      await persistNewFlashcards(cards);
    } catch {
      /* handle error */
    }
    setIsLoading(false);
  };

  const totalCards = flashcards.length;
  const dueToday = dueCards.length;
  const mastered = flashcards.filter(
    (c) => (c.reviewCount ?? 0) >= 5 && c.nextReview > Date.now(),
  ).length;

  const displayCards = isReviewMode ? dueCards : flashcards;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">🃏 Flashcards</h1>
        <p className="text-slate-400">
          Generate and study flashcards with spaced repetition
        </p>
      </div>

      {/* Stats Overview */}
      {totalCards > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 text-center">
            <p className="text-2xl font-bold text-white">{totalCards}</p>
            <p className="text-xs text-slate-400 mt-1">Total Cards</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 text-center">
            <p className="text-2xl font-bold text-cyan-400">{dueToday}</p>
            <p className="text-xs text-slate-400 mt-1">Due Today</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 text-center">
            <p className="text-2xl font-bold text-green-400">{mastered}</p>
            <p className="text-xs text-slate-400 mt-1">Mastered</p>
          </div>
        </div>
      )}

      {/* Mode Toggle & Transfer Button */}
      <div className="flex items-center gap-3 flex-wrap">
        {totalCards > 0 && (
          <>
            <Button
              variant={isReviewMode ? 'secondary' : 'ghost'}
              onClick={() => setReviewMode(false)}
            >
              All Cards
            </Button>
            <Button
              variant={isReviewMode ? 'primary' : 'ghost'}
              onClick={() => setReviewMode(true)}
              disabled={dueToday === 0}
            >
              Review Due ({dueToday})
            </Button>
          </>
        )}
        <div className="flex-1" />
        <Button
          variant={showTransfer ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setShowTransfer(!showTransfer)}
        >
          <HiSwitchHorizontal /> Import / Export
        </Button>
      </div>

      {/* Export/Import Panel */}
      {showTransfer && (
        <ExportImportPanel
          flashcards={flashcards}
          onImportComplete={loadFromStorage}
        />
      )}

      {/* Deck Overview (when not in review mode) */}
      {!isReviewMode && decks.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Decks
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {decks.map((deck) => (
              <div
                key={deck.id}
                className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white truncate">
                    {deck.name}
                  </span>
                  {deck.dueCount > 0 && (
                    <Badge color="cyan">{deck.dueCount} due</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span>{deck.cardCount} cards</span>
                  <span>{deck.masteredCount} mastered</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generate Section */}
      <div className="flex items-center gap-3">
        <select
          value={selectedDoc}
          onChange={(e) => setSelectedDoc(e.target.value)}
          className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200"
        >
          <option value="">Select document...</option>
          {documents.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.name}
            </option>
          ))}
        </select>
        <Button
          onClick={handleGenerate}
          isLoading={isLoading}
          disabled={!selectedDoc}
        >
          Generate Flashcards
        </Button>
      </div>

      {/* Card Display */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : isReviewMode ? (
        dueCards.length === 0 ? (
          <EmptyState
            icon="✅"
            title="All caught up!"
            description="No cards are due for review right now. Come back later or generate new cards."
          />
        ) : (
          <FlashcardDeck
            cards={dueCards}
            onRate={handleRate}
          />
        )
      ) : flashcards.length === 0 ? (
        <EmptyState
          icon="🃏"
          title="No flashcards yet"
          description="Select a document and generate flashcards to start studying"
        />
      ) : (
        <FlashcardDeck
          cards={flashcards}
          onRate={handleRate}
        />
      )}
    </div>
  );
}
