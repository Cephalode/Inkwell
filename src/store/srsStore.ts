import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Per-card SRS state. Fixed interval table (no SM-2) — upgrading means
 *  swapping the interval/dueAt computation in gradeCard for a scheduler fn. */
export interface SrsCardState {
  /** 0 = Not started, 1 = In progress, 2 = Learned, 3 = Known */
  mastery: 0 | 1 | 2 | 3;
  lastGradeAt: number;
  interval: string;
  dueAt: number;
}

export interface SrsEvent {
  cardId: string;
  grade: 0 | 1 | 2 | 3;
  at: number;
}

export const SRS_INTERVALS = ['again <10m', '1 day', '3 days', '7 days'] as const;

interface SrsStoreState {
  srs: Record<string, SrsCardState>;
  events: SrsEvent[];
  gradeCard: (cardId: string, grade: 0 | 1 | 2 | 3) => void;
}

export const useSrsStore = create<SrsStoreState>()(
  persist(
    (set) => ({
      srs: {},
      events: [],

      gradeCard: (cardId, grade) =>
        set((state) => {
          const now = Date.now();
          const prev = state.srs[cardId];
          const m = prev?.mastery ?? 0;
          const mastery: 0 | 1 | 2 | 3 =
            grade === 0
              ? (Math.max(0, m - 1) as 0 | 1 | 2 | 3)
              : grade === 1
                ? m
                : (Math.min(3, m + 1) as 0 | 1 | 2 | 3);
          const dueAt =
            grade === 0
              ? now + 10 * 60_000
              : now + [0, 1, 3, 7][grade] * 86_400_000;
          return {
            srs: {
              ...state.srs,
              [cardId]: { mastery, lastGradeAt: now, interval: SRS_INTERVALS[grade], dueAt },
            },
            events: [...state.events, { cardId, grade, at: now }].slice(-500),
          };
        }),
    }),
    { name: 'inkwell-srs' }
  )
);

/** A card is due when it has never been graded or its dueAt has passed. */
export function isDue(entry: SrsCardState | undefined, now = Date.now()): boolean {
  return !entry || entry.dueAt <= now;
}

/** Number of due cards among `cardIds`. */
export function dueCount(
  srs: Record<string, SrsCardState>,
  cardIds: string[],
  now = Date.now()
): number {
  return cardIds.filter((id) => isDue(srs[id], now)).length;
}
