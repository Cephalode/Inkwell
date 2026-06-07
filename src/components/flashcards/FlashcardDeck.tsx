import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../shared/Button';
import Badge from '../shared/Badge';
import { HiChevronLeft, HiChevronRight, HiLightningBolt } from 'react-icons/hi';
import { Flashcard } from '../../types/flashcard';

interface FlashcardDeckProps {
  cards: Flashcard[];
  onRate?: (cardId: string, difficulty: 'easy' | 'medium' | 'hard') => void;
}

export default function FlashcardDeck({ cards, onRate }: FlashcardDeckProps) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // Clamp index when cards shrink (e.g., in review mode after rating)
  useEffect(() => {
    if (cards.length === 0) return;
    if (index >= cards.length) {
      setIndex(cards.length - 1);
      setFlipped(false);
    }
  }, [cards.length, index]);

  if (cards.length === 0) {
    return (
      <div className="text-center text-slate-500 py-16">
        No flashcards yet. Generate some from a document!
      </div>
    );
  }

  const safeIndex = Math.min(index, cards.length - 1);
  const card = cards[safeIndex];

  const handleRate = (difficulty: 'easy' | 'medium' | 'hard') => {
    if (!onRate) return;
    onRate(card.id, difficulty);
    setFlipped(false);
    // Don't auto-advance here; the card list may shrink in review mode,
    // so let the useEffect handle clamping.
    // For non-review mode, advance manually.
    if (safeIndex < cards.length - 1) {
      setIndex((i) => i + 1);
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Badge color="cyan">
          {safeIndex + 1} / {cards.length}
        </Badge>
        <Badge color="gray">{card.deck}</Badge>
        {card.reviewCount > 0 && (
          <Badge color="purple">
            {card.repetitions} rep{card.repetitions !== 1 ? 's' : ''} ·{' '}
            {card.interval}d interval
          </Badge>
        )}
      </div>
      <div
        onClick={() => setFlipped(!flipped)}
        className="w-full max-w-xl h-56 sm:h-72 cursor-pointer perspective-1000"
      >
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.5 }}
          className="w-full h-full relative preserve-3d"
        >
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 flex items-center justify-center p-4 sm:p-8 backface-hidden">
            <p className="text-base sm:text-lg text-slate-200 text-center">{card.front}</p>
          </div>
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-900/30 to-slate-900 border border-cyan-600/30 flex items-center justify-center p-4 sm:p-8 backface-hidden rotate-y-180">
            <p className="text-base sm:text-lg text-slate-200 text-center">{card.back}</p>
          </div>
        </motion.div>
      </div>
      <p className="text-xs text-slate-500 mt-3">Click card to flip</p>
      <div className="flex flex-col sm:flex-row gap-3 mt-4 sm:mt-6 w-full sm:w-auto">
        <Button
          variant="ghost"
          onClick={() => {
            setIndex(Math.max(0, safeIndex - 1));
            setFlipped(false);
          }}
        >
          <HiChevronLeft /> Prev
        </Button>
        {onRate && flipped && (
          <>
            <Button variant="danger" size="sm" onClick={() => handleRate('hard')}>
              Hard
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleRate('medium')}
            >
              Medium
            </Button>
            <Button size="sm" onClick={() => handleRate('easy')}>
              Easy
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            setIndex(Math.min(cards.length - 1, safeIndex + 1));
            setFlipped(false);
          }}
        >
          Next <HiChevronRight />
        </Button>
      </div>
    </div>
  );
}
