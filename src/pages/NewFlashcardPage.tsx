import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useFlashcardStore } from '../store/flashcardStore';

export default function NewFlashcardPage() {
  const { deckId = '' } = useParams();
  const deck = useFlashcardStore((s) => s.decks.find((d) => d.id === deckId));

  useEffect(() => {
    if (!deck && deckId) {
      useFlashcardStore.getState().fetchDeck(deckId).catch(console.error);
    }
    // Guarded: only fires when the deck isn't already loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  return (
    <div className="max-w-lg mx-auto py-16">
      <div className="rounded-xl border border-[var(--color-border)] p-8 text-center space-y-4">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">{deck?.title ?? 'Deck'}</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Single-card creation is coming soon — decks are generated from a course or document for
          now.
        </p>
        <Link
          to={`/flashcards/${deckId}`}
          className="inline-block text-sm text-[var(--color-accent-700)] hover:underline"
        >
          ← Back to deck
        </Link>
      </div>
    </div>
  );
}
