import { Flashcard } from '../types/flashcard';

/** User-facing rating mapped to SM-2 0-5 scale */
export type UserRating = 'hard' | 'medium' | 'easy';

const RATING_MAP: Record<UserRating, number> = {
  hard: 2,
  medium: 3,
  easy: 4,
};

export interface SM2Result {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReview: number;
  lastReview: number;
}

/**
 * Apply the SM-2 spaced repetition algorithm.
 *
 * @param card   The flashcard with current SM-2 state
 * @param rating User-facing difficulty rating
 * @returns      Updated SM-2 fields to merge into the card
 */
export function applySM2(card: Flashcard, rating: UserRating): SM2Result {
  const quality = RATING_MAP[rating];
  const now = Date.now();

  const currentEF = card.easeFactor ?? 2.5;
  const currentReps = card.repetitions ?? 0;

  // Calculate new ease factor
  let newEF =
    currentEF + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (newEF < 1.3) newEF = 1.3;

  let newInterval: number;
  let newReps: number;

  if (quality >= 3) {
    // Passed
    newReps = currentReps + 1;
    if (newReps === 1) {
      newInterval = 1;
    } else if (newReps === 2) {
      newInterval = 6;
    } else {
      newInterval = Math.round(card.interval * newEF);
    }
  } else {
    // Failed — reset
    newReps = 0;
    newInterval = 1;
    // Ease factor still updates (SM-2 spec)
  }

  const nextReview = now + newInterval * 24 * 60 * 60 * 1000;

  return {
    easeFactor: Math.round(newEF * 100) / 100, // round to 2 decimal places
    interval: newInterval,
    repetitions: newReps,
    nextReview,
    lastReview: now,
  };
}

/** Convert milliseconds to approximate days for display */
export function msToDays(ms: number): number {
  return Math.round(ms / (24 * 60 * 60 * 1000));
}
