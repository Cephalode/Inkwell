import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PiArrowsClockwiseDuotone, PiCheckCircleDuotone } from 'react-icons/pi';
import Spinner from '../components/shared/Spinner';
import { useFlashcardDeck, useFlashcardGeneration } from '../hooks/useFlashcards';
import { useFlashcardStore } from '../store/flashcardStore';

/** Flashcard review — the Study Desk prototype's session flow: flip to
 *  reveal, grade yourself, finish with a session summary. Grades map onto
 *  the existing correct/incorrect review API. */
export default function FlashcardDetailPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();

  const { cards, loading } = useFlashcardDeck(deckId || '');
  const { generate, generating: generateInFlight, generationProgress } = useFlashcardGeneration();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionGrades, setSessionGrades] = useState({ got: 0, missed: 0 });

  const deck = useFlashcardStore((s) => s.decks.find((d) => d.id === deckId));

  const mastery = useMemo(() => {
    const reviewedCount = cards.filter((c) => (c.review_stats?.timesReviewed ?? 0) > 0).length;
    const totalReviewed = cards.reduce((sum, c) => sum + (c.review_stats?.timesReviewed ?? 0), 0);
    const totalCorrect = cards.reduce((sum, c) => sum + (c.review_stats?.timesCorrect ?? 0), 0);
    const correctRate = totalReviewed > 0 ? Math.round((totalCorrect / totalReviewed) * 100) : 0;
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
    setSessionGrades({ got: 0, missed: 0 });
  };

  const currentCard = cards[currentIndex];
  const totalCards = cards.length;
  const finished = totalCards > 0 && currentIndex >= totalCards;

  const grade = async (correct: boolean) => {
    if (currentCard) {
      await useFlashcardStore.getState().reviewCard(currentCard.id, correct);
    }
    setSessionGrades((g) => (correct ? { ...g, got: g.got + 1 } : { ...g, missed: g.missed + 1 }));
    setCurrentIndex((i) => i + 1);
    setIsFlipped(false);
  };

  const restart = () => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setSessionGrades({ got: 0, missed: 0 });
  };

  if (!deck) {
    if (loading) {
      return (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      );
    }
    return <div>Deck not found</div>;
  }

  if (loading && totalCards === 0) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div
      className="mx-auto flex flex-col"
      style={{ maxWidth: 640, minHeight: 'calc(100vh - 48px)', padding: 'var(--space-2)' }}
    >
      {/* Breadcrumb + regenerate */}
      <div className="flex items-center justify-between" style={{ gap: 'var(--space-4)' }}>
        <div className="card-kicker whitespace-nowrap" style={{ fontSize: 12 }}>
          <a
            className="cursor-pointer"
            style={{ color: 'var(--color-accent)' }}
            onClick={() => navigate('/flashcards')}
          >
            ← Flashcards
          </a>{' '}
          · {deck.title}
        </div>
        <button
          className="btn btn-ghost"
          style={{ fontSize: 13 }}
          onClick={handleRegenerate}
          disabled={generating || deck.status === 'generating'}
          title="Regenerate cards"
        >
          <PiArrowsClockwiseDuotone size={15} />
          &nbsp;{generating ? 'Generating…' : 'Regenerate'}
        </button>
      </div>

      {deck.status === 'error' && (
        <div
          style={{
            marginTop: 'var(--space-3)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
            color: 'var(--color-danger)',
            fontSize: 14,
          }}
        >
          {deck.error || 'Generation failed'}
        </div>
      )}

      {totalCards === 0 ? (
        <div
          className="flex flex-1 flex-col items-center justify-center text-center"
          style={{ gap: 'var(--space-3)' }}
        >
          <div style={{ fontSize: 16, opacity: 0.6 }}>No cards in this deck yet</div>
          <button className="btn btn-primary" onClick={handleRegenerate} disabled={generating}>
            {generating ? 'Generating…' : 'Generate cards'}
          </button>
        </div>
      ) : !finished ? (
        <>
          <div style={{ fontSize: 13, opacity: 0.5, marginTop: 'var(--space-2)' }}>
            Card {Math.min(currentIndex + 1, totalCards)} of {totalCards}
            {mastery.reviewedCount > 0 &&
              ` · ${mastery.reviewedCount} reviewed all-time · ${mastery.correctRate}% correct`}
          </div>

          {/* The card */}
          <div
            onClick={() => setIsFlipped((f) => !f)}
            className="flex flex-1 cursor-pointer flex-col items-center justify-center text-center"
            style={{
              gap: 'var(--space-4)',
              border: '1px solid var(--color-neutral-300)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-surface)',
              margin: 'var(--space-4) 0',
              padding: 'var(--space-8) var(--space-6)',
              minHeight: 280,
            }}
          >
            {isFlipped ? (
              <>
                <div style={{ fontSize: 14, opacity: 0.5 }}>{currentCard?.front}</div>
                <div style={{ width: 48, borderTop: '1px solid var(--color-neutral-400)' }} />
                <div style={{ fontSize: 21, lineHeight: 1.5, maxWidth: '46ch' }}>
                  {currentCard?.back}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 24, lineHeight: 1.45, maxWidth: '40ch' }}>
                  {currentCard?.front}
                </div>
                <div style={{ fontSize: 12.5, opacity: 0.4 }}>Click to reveal</div>
              </>
            )}
          </div>

          {isFlipped ? (
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <button
                onClick={() => grade(false)}
                className="btn btn-secondary"
                style={{ flexDirection: 'column', gap: 2, padding: '10px 8px' }}
              >
                <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--color-accent-2-700)' }}>
                  Missed it
                </span>
                <span style={{ fontSize: 11.5, opacity: 0.45 }}>see it again soon</span>
              </button>
              <button
                onClick={() => grade(true)}
                className="btn btn-secondary"
                style={{ flexDirection: 'column', gap: 2, padding: '10px 8px' }}
              >
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>Got it</span>
                <span style={{ fontSize: 11.5, opacity: 0.45 }}>counts toward mastery</span>
              </button>
            </div>
          ) : (
            <div className="text-center" style={{ fontSize: 13, opacity: 0.45, padding: '12px 0' }}>
              How did you do? Grade yourself after flipping.
            </div>
          )}
        </>
      ) : (
        <div
          className="flex flex-1 flex-col items-center justify-center text-center"
          style={{ gap: 'var(--space-3)' }}
        >
          <PiCheckCircleDuotone size={44} style={{ color: 'var(--color-accent)' }} />
          <div style={{ fontSize: 22, fontWeight: 600 }}>Session done — {totalCards} cards</div>
          <div style={{ fontSize: 14, opacity: 0.6 }}>
            {sessionGrades.got} got it · {sessionGrades.missed} missed
          </div>
          <div className="flex" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
            <button className="btn btn-primary" onClick={restart}>
              Review again
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/flashcards')}>
              Back to decks
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
