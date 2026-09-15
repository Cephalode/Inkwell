import { useCallback, useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { PiCheckCircleDuotone } from 'react-icons/pi';
import Spinner from '../shared/Spinner';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useLearningStore } from '../../store/learningStore';
import type { FlashcardsContent } from '../../types/learning';
import type { ActivityRunnerProps } from './runnerProps';

const NO_CARDS: FlashcardsContent['cards'] = [];

/**
 * Flashcard drill for a roadmap step — the Study Desk flip-card session:
 * flip to reveal, grade yourself, review the tally, then send the grades to
 * the server (which turns them into evidence + XP).
 *
 * Keyboard: Space / Enter flips · ← or 1 = missed it · → or 2 = got it.
 */
export default function FlashcardRunner({ activity, onComplete, onAbandon }: ActivityRunnerProps) {
  const cards = (activity.content as FlashcardsContent | null)?.cards ?? NO_CARDS;
  const total = cards.length;
  const isMobile = useIsMobile();

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [grades, setGrades] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = cards[index];
  const finished = total > 0 && index >= total;

  const grade = useCallback(
    (correct: boolean) => {
      if (!current) return;
      setGrades((g) => ({ ...g, [current.id]: correct }));
      setIndex((i) => i + 1);
      setFlipped(false);
    },
    [current],
  );

  // Blur the clicked button so a following Space/Enter flips the next card
  // instead of re-activating the button.
  const gradeClick = (correct: boolean) => (e: MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    grade(correct);
  };

  const restart = () => {
    setIndex(0);
    setFlipped(false);
    setError(null);
  };

  const finish = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await useLearningStore.getState().submitActivity(activity.id, { grades });
      onComplete(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your session');
      setSubmitting(false);
    }
  };

  // Keyboard shortcuts while a card is on screen.
  useEffect(() => {
    if (finished || submitting || total === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      // A focused real <button> keeps Enter/Space for itself (keyboard grading).
      const onButton = t?.tagName === 'BUTTON';
      if ((e.key === ' ' || e.key === 'Enter') && !onButton) {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && (e.key === 'ArrowLeft' || e.key === '1')) {
        e.preventDefault();
        grade(false);
      } else if (flipped && (e.key === 'ArrowRight' || e.key === '2')) {
        e.preventDefault();
        grade(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finished, submitting, total, flipped, grade]);

  const got = cards.reduce((n, c) => n + (grades[c.id] === true ? 1 : 0), 0);
  const missed = cards.reduce((n, c) => n + (grades[c.id] === false ? 1 : 0), 0);

  if (total === 0) {
    return (
      <div className="card flex flex-col items-center text-center" style={{ padding: 'var(--space-6)', gap: 'var(--space-3)' }}>
        <div style={{ fontSize: 15, opacity: 0.6 }}>This drill has no cards.</div>
        <button type="button" className="btn btn-secondary" onClick={onAbandon}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex flex-col" style={{ maxWidth: 640, width: '100%' }}>
      {!finished ? (
        <>
          <div className="flex items-baseline justify-between" style={{ gap: 'var(--space-3)' }}>
            <div style={{ fontSize: 13, opacity: 0.5 }}>
              Card {Math.min(index + 1, total)} of {total}
            </div>
            {!isMobile && (
              <div style={{ fontSize: 12, opacity: 0.4, whiteSpace: 'nowrap' }}>
                Space to flip · ← missed · → got it
              </div>
            )}
          </div>

          {/* Progress rule */}
          <div
            style={{
              height: 2,
              marginTop: 'var(--space-2)',
              background: 'color-mix(in srgb, var(--color-text) 10%, transparent)',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${(index / total) * 100}%`,
                background: 'var(--color-accent)',
                transition: 'width 160ms ease',
              }}
            />
          </div>

          {/* The card */}
          <div
            role="button"
            tabIndex={0}
            aria-label={flipped ? 'Flip card to the front' : 'Flip card to reveal the answer'}
            onClick={() => setFlipped((f) => !f)}
            className="flex cursor-pointer select-none flex-col items-center justify-center text-center"
            style={{
              gap: 'var(--space-4)',
              border: '1px solid var(--color-neutral-300)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-surface)',
              margin: 'var(--space-4) 0',
              padding: isMobile ? 'var(--space-6) var(--space-4)' : 'var(--space-8) var(--space-6)',
              minHeight: isMobile ? 240 : 300,
              boxShadow: flipped ? 'var(--shadow-md)' : 'var(--shadow-sm)',
              transition: 'box-shadow 120ms ease, border-color 120ms ease',
              borderColor: flipped ? 'color-mix(in srgb, var(--color-accent) 45%, transparent)' : undefined,
            }}
          >
            {flipped ? (
              <>
                <div style={{ fontSize: 14, opacity: 0.5, maxWidth: '46ch' }}>{current.front}</div>
                <div style={{ width: 48, borderTop: '1px solid var(--color-neutral-400)' }} />
                <div style={{ fontSize: isMobile ? 18 : 21, lineHeight: 1.5, maxWidth: '46ch', whiteSpace: 'pre-wrap' }}>
                  {current.back}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: isMobile ? 20 : 24, lineHeight: 1.45, maxWidth: '40ch', whiteSpace: 'pre-wrap' }}>
                  {current.front}
                </div>
                <div style={{ fontSize: 12.5, opacity: 0.4 }}>{isMobile ? 'Tap to reveal' : 'Click to reveal'}</div>
              </>
            )}
          </div>

          {flipped ? (
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <button
                type="button"
                onClick={gradeClick(false)}
                className="btn btn-secondary"
                style={{ flexDirection: 'column', gap: 2, padding: '10px 8px' }}
              >
                <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--color-accent-2-700)' }}>Missed it</span>
                <span style={{ fontSize: 11.5, opacity: 0.45 }}>see it again soon</span>
              </button>
              <button
                type="button"
                onClick={gradeClick(true)}
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
          className="flex flex-col items-center justify-center text-center"
          style={{ gap: 'var(--space-3)', padding: 'var(--space-8) var(--space-4)' }}
        >
          <PiCheckCircleDuotone size={44} style={{ color: 'var(--color-accent)' }} />
          <div style={{ fontSize: 22, fontWeight: 600 }}>Session done — {total} cards</div>
          <div style={{ fontSize: 14, opacity: 0.6 }}>
            <span style={{ color: 'var(--color-success)' }}>{got} got it</span> ·{' '}
            <span style={{ color: 'var(--color-accent-2-700)' }}>{missed} missed</span>
          </div>
          {missed > 0 && (
            <div style={{ fontSize: 13, opacity: 0.5, maxWidth: '40ch' }}>
              Going through again lets you re-grade the ones you missed before you finish.
            </div>
          )}

          {error && (
            <div
              role="alert"
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
                color: 'var(--color-danger)',
                fontSize: 14,
                maxWidth: 420,
              }}
            >
              {error}
            </div>
          )}

          <div className="flex flex-wrap justify-center" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
            <button type="button" className="btn btn-primary" onClick={finish} disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner size="sm" />
                  &nbsp;Saving…
                </>
              ) : (
                'Finish'
              )}
            </button>
            <button type="button" className="btn btn-secondary" onClick={restart} disabled={submitting}>
              Go through again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
