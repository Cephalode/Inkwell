import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HiArrowLeft, HiRefresh } from 'react-icons/hi';
import Spinner from '../components/shared/Spinner';
import { useFlashcardDeck, useFlashcardGeneration } from '../hooks/useFlashcards';
import { useFlashcardStore } from '../store/flashcardStore';

export default function FlashcardDetailPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();

  const { cards, loading } = useFlashcardDeck(deckId || '');
  const { generate, generating: generateInFlight, generationProgress } = useFlashcardGeneration();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const deck = useFlashcardStore((s) =>
    s.decks.find((d) => d.id === deckId)
  );

  // Aggregate mastery across the whole deck (computed client-side from each
  // card's review_stats). Recomputes reactively because the store updates the
  // reviewed card in place, producing a new `cards` array reference.
  const mastery = useMemo(() => {
    const reviewedCount = cards.filter(
      (c) => (c.review_stats?.timesReviewed ?? 0) > 0
    ).length;
    const totalReviewed = cards.reduce(
      (sum, c) => sum + (c.review_stats?.timesReviewed ?? 0),
      0
    );
    const totalCorrect = cards.reduce(
      (sum, c) => sum + (c.review_stats?.timesCorrect ?? 0),
      0
    );
    // Cards with timesReviewed === 0 contribute 0 to both sums, so they are
    // naturally excluded from the denominator.
    const correctRate =
      totalReviewed > 0 ? Math.round((totalCorrect / totalReviewed) * 100) : 0;
    return { reviewedCount, correctRate };
  }, [cards]);

  if (!deckId) {
    return <div>Deck not found</div>;
  }

  // Also reflect generations started elsewhere (e.g. the list page's create flow)
  const generating = generateInFlight || !!generationProgress[deckId];

  const handleRegenerate = async () => {
    await generate(deckId);
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  const currentCard = cards[currentIndex];
  const totalCards = cards.length;
  const progress_pct = totalCards > 0 ? ((currentIndex + 1) / totalCards) * 100 : 0;

  if (!deck) {
    return <div>Deck not found</div>;
  }

  if (loading && totalCards === 0) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (totalCards === 0) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate('/flashcards')}
          className="flex items-center gap-2 px-3 py-1.5 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <HiArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="text-center py-10">
          <p className="text-slate-400 mb-4">No cards in this deck yet</p>
          <button
            onClick={handleRegenerate}
            disabled={generating}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {generating ? 'Generating…' : 'Generate Cards'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => navigate('/flashcards')}
          className="flex items-center gap-2 px-3 py-1.5 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <HiArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{deck.title}</h1>
          <p className="text-sm text-slate-400">{totalCards} cards</p>
        </div>
        <button
          onClick={handleRegenerate}
          disabled={generating || deck.status === 'generating'}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors disabled:opacity-50"
          title="Regenerate"
        >
          <HiRefresh className="w-5 h-5" />
        </button>
      </div>

      {/* Deck status */}
      {deck.status === 'error' && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
          {deck.error || 'Generation failed'}
        </div>
      )}

      {/* Mastery summary */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-slate-700/50 bg-slate-800/40 px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Reviewed</span>
          <span className="font-semibold text-teal-300 tabular-nums">
            {mastery.reviewedCount}
            <span className="mx-1 text-slate-500">of</span>
            {totalCards}
          </span>
        </div>
        <div className="hidden sm:block h-4 w-px bg-slate-700/60" />
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Correct rate</span>
          <span className="font-semibold text-teal-300 tabular-nums">
            {mastery.correctRate}%
          </span>
        </div>
      </div>

      {/* Study area */}
      <div className="space-y-4">
        {/* Progress bar */}
        <div className="w-full h-2 bg-slate-700/60 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-300"
            style={{ width: `${progress_pct}%` }}
          />
        </div>

        {/* Flashcard */}
        <div
          onClick={() => setIsFlipped(!isFlipped)}
          className="h-64 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-xl p-6 cursor-pointer hover:border-amber-500/50 transition-all flex items-center justify-center"
        >
          <div className="text-center max-w-md">
            <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide">
              {isFlipped ? 'Back' : 'Front'}
            </p>
            <p className="text-xl font-semibold text-slate-200">
              {isFlipped ? currentCard?.back : currentCard?.front}
            </p>
            <p className="text-xs text-slate-500 mt-4">Click to flip</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => {
              if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
              setIsFlipped(false);
            }}
            disabled={currentIndex === 0}
            className="px-6 py-2 bg-slate-700/50 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg font-medium transition-colors"
          >
            Previous
          </button>

          <button
            onClick={async () => {
              if (currentCard) {
                await useFlashcardStore.getState().reviewCard(currentCard.id, false);
              }
              if (currentIndex < totalCards - 1) {
                setCurrentIndex(currentIndex + 1);
                setIsFlipped(false);
              }
            }}
            className="px-6 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg font-medium transition-colors"
          >
            Missed
          </button>

          <button
            onClick={async () => {
              if (currentCard) {
                await useFlashcardStore.getState().reviewCard(currentCard.id, true);
              }
              if (currentIndex < totalCards - 1) {
                setCurrentIndex(currentIndex + 1);
                setIsFlipped(false);
              }
            }}
            className="px-6 py-2 bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded-lg font-medium transition-colors"
          >
            Got it
          </button>

          <button
            onClick={() => {
              if (currentIndex < totalCards - 1) setCurrentIndex(currentIndex + 1);
              setIsFlipped(false);
            }}
            disabled={currentIndex === totalCards - 1}
            className="px-6 py-2 bg-slate-700/50 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg font-medium transition-colors"
          >
            Next
          </button>
        </div>

        {/* Stats */}
        <div className="text-center text-sm text-slate-500">
          Card {currentIndex + 1} of {totalCards}
        </div>

        {/* Review stats */}
        {currentCard?.review_stats && (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-center text-xs text-slate-400 space-y-1">
            <div>Reviewed: {currentCard.review_stats.timesReviewed} times</div>
            <div>
              Correct rate: {currentCard.review_stats.timesReviewed > 0
                ? Math.round(
                    (currentCard.review_stats.timesCorrect /
                      currentCard.review_stats.timesReviewed) *
                      100
                  )
                : 0}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
