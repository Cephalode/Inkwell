import { useState } from 'react';
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

  if (cards.length === 0) {
    return <div className="text-center text-slate-500 py-16">No flashcards yet. Generate some from a document!</div>;
  }

  const card = cards[index];

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-2 mb-4">
        <Badge color="cyan">{index + 1} / {cards.length}</Badge>
        <Badge color="gray">{card.deck}</Badge>
      </div>
      <div
        onClick={() => setFlipped(!flipped)}
        className="w-full max-w-xl h-72 cursor-pointer perspective-1000"
      >
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.5 }}
          className="w-full h-full relative preserve-3d"
        >
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 flex items-center justify-center p-8 backface-hidden">
            <p className="text-lg text-slate-200 text-center">{card.front}</p>
          </div>
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-900/30 to-slate-900 border border-cyan-600/30 flex items-center justify-center p-8 backface-hidden rotate-y-180">
            <p className="text-lg text-slate-200 text-center">{card.back}</p>
          </div>
        </motion.div>
      </div>
      <p className="text-xs text-slate-500 mt-3">Click card to flip</p>
      <div className="flex gap-3 mt-6">
        <Button variant="ghost" onClick={() => { setIndex(Math.max(0, index - 1)); setFlipped(false); }}>
          <HiChevronLeft /> Prev
        </Button>
        {onRate && flipped && (
          <>
            <Button variant="danger" size="sm" onClick={() => { onRate(card.id, 'hard'); setIndex(Math.min(cards.length - 1, index + 1)); setFlipped(false); }}>Hard</Button>
            <Button variant="secondary" size="sm" onClick={() => { onRate(card.id, 'medium'); setIndex(Math.min(cards.length - 1, index + 1)); setFlipped(false); }}>Medium</Button>
            <Button size="sm" onClick={() => { onRate(card.id, 'easy'); setIndex(Math.min(cards.length - 1, index + 1)); setFlipped(false); }}>Easy</Button>
          </>
        )}
        <Button variant="ghost" onClick={() => { setIndex(Math.min(cards.length - 1, index + 1)); setFlipped(false); }}>
          Next <HiChevronRight />
        </Button>
      </div>
    </div>
  );
}
