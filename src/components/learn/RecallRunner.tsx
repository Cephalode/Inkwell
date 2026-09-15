import { useState } from 'react';
import { HiOutlineLightBulb } from 'react-icons/hi2';
import Markdown from '../shared/Markdown';
import Spinner from '../shared/Spinner';
import { useLearningStore } from '../../store/learningStore';
import type { RecallContent } from '../../types/learning';
import type { ActivityRunnerProps } from './runnerProps';

const MIN_WORDS = 15;
const TARGET_MIN = 80;
const TARGET_MAX = 200;

const NO_STRINGS: string[] = [];

const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * "Teach it back": explain the step from memory; the server grades the
 * explanation against a rubric the learner only sees after submitting.
 */
export default function RecallRunner({ activity, onComplete }: ActivityRunnerProps) {
  const content = activity.content as RecallContent | null;
  const prompt = content?.prompt ?? '';
  const hints = content?.hints ?? NO_STRINGS;
  const rubricSize = content?.rubric?.length ?? 0;

  const [answer, setAnswer] = useState('');
  const [hintsShown, setHintsShown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const words = countWords(answer);
  const canSubmit = words >= MIN_WORDS && !submitting;

  let countNote: string;
  let countColor: string | undefined;
  if (words < MIN_WORDS) countNote = `at least ${MIN_WORDS} to submit · aim for ${TARGET_MIN}–${TARGET_MAX}`;
  else if (words < TARGET_MIN) countNote = `aim for ${TARGET_MIN}–${TARGET_MAX} words`;
  else if (words <= TARGET_MAX) {
    countNote = 'on target';
    countColor = 'var(--color-success)';
  } else {
    countNote = 'a little long — that’s fine, just keep it focused';
    countColor = 'var(--color-warning)';
  }

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await useLearningStore.getState().submitActivity(activity.id, { answer: answer.trim() });
      onComplete(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your explanation');
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex flex-col" style={{ maxWidth: 760, width: '100%', gap: 'var(--space-4)' }}>
      {/* Prompt */}
      <div className="card" style={{ padding: 'var(--space-4) var(--space-5)' }}>
        <div className="card-kicker">Teach it back</div>
        <div style={{ marginTop: 'var(--space-2)', fontSize: 15 }}>
          <Markdown content={prompt} className="[&_p]:text-[15px] [&_li]:text-[15px]" />
        </div>
        <div style={{ marginTop: 'var(--space-3)', fontSize: 13, opacity: 0.55 }}>
          Explain it in your own words, as if to a classmate. Your explanation will be graded against a{' '}
          {rubricSize}-point rubric, revealed after you submit.
        </div>
      </div>

      {/* Hints */}
      {hints.length > 0 && (
        <div className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
          <div className="flex items-center justify-between" style={{ gap: 'var(--space-3)' }}>
            <div className="section-label">Hints</div>
            {hintsShown < hints.length ? (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 13 }}
                onClick={() => setHintsShown((n) => Math.min(n + 1, hints.length))}
                disabled={submitting}
              >
                <HiOutlineLightBulb size={15} />
                Show a hint ({hintsShown + 1} of {hints.length})
              </button>
            ) : (
              <div style={{ fontSize: 12.5, opacity: 0.45 }}>All hints shown</div>
            )}
          </div>
          {hintsShown === 0 ? (
            <div style={{ fontSize: 13, opacity: 0.45 }}>
              Stuck? Reveal hints one at a time — try from memory first.
            </div>
          ) : (
            <ol className="flex flex-col" style={{ gap: 'var(--space-2)', margin: 0, padding: 0, listStyle: 'none' }}>
              {hints.slice(0, hintsShown).map((hint, i) => (
                <li
                  key={i}
                  className="flex"
                  style={{
                    gap: 'var(--space-2)',
                    padding: '8px 12px',
                    fontSize: 14,
                    borderLeft: '2px solid var(--color-accent)',
                    background: 'color-mix(in srgb, var(--color-accent) 7%, transparent)',
                    borderRadius: '0 var(--radius-md) var(--radius-md) 0',
                  }}
                >
                  <span style={{ opacity: 0.5, fontSize: 12.5, paddingTop: 2, whiteSpace: 'nowrap' }}>Hint {i + 1}</span>
                  <Markdown content={hint} compact className="[&_p]:text-sm" />
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Explanation */}
      <div className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
        <label htmlFor={`recall-answer-${activity.id}`} className="section-label">
          Your explanation
        </label>
        <textarea
          id={`recall-answer-${activity.id}`}
          className="input"
          rows={8}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          disabled={submitting}
          placeholder="Start with the big idea, then walk through how it works and why it matters…"
          style={{ minHeight: 200, resize: 'vertical', fontSize: 15, lineHeight: 1.6, padding: '12px 14px' }}
        />
        <div className="flex flex-wrap items-center justify-between" style={{ gap: 'var(--space-3)' }}>
          <div style={{ fontSize: 13, opacity: countColor ? 0.9 : 0.5, color: countColor }}>
            {words} {words === 1 ? 'word' : 'words'} · {countNote}
          </div>
          <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={!canSubmit}>
            {submitting ? (
              <>
                <Spinner size="sm" />
                &nbsp;Reviewing your explanation…
              </>
            ) : (
              'Submit explanation'
            )}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
            color: 'var(--color-danger)',
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
