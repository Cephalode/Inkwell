import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi2';
import Spinner from '../shared/Spinner';
import Markdown from '../shared/Markdown';
import { useLearningStore } from '../../store/learningStore';
import type { QuizContent, QuizQuestionType } from '../../types/learning';
import type { ActivityRunnerProps } from './runnerProps';

type Answer = string | boolean;

const TYPE_LABEL: Record<QuizQuestionType, string> = {
  mcq: 'Multiple choice',
  true_false: 'True or false',
  short_answer: 'Short answer',
};

const isAnswered = (a: Answer | undefined) => a !== undefined && (typeof a !== 'string' || a.trim() !== '');

// Draft persistence: answers + position survive remount (Resume) and reload.
// Keyed by activity id — a regenerated quiz gets a new id, so drafts never
// collide. Abandoned quizzes leave a stale key behind (~2 KB); harmless.
const draftKey = (activityId: string) => `quiz-draft:${activityId}`;
const readDraft = (key: string): { index: number; answers: Record<string, Answer> } => {
  try {
    const d = JSON.parse(localStorage.getItem(key) ?? '');
    return { index: Number(d?.index) || 0, answers: d?.answers ?? {} };
  } catch {
    return { index: 0, answers: {} };
  }
};

function Radio({ on }: { on: boolean }) {
  return (
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
      style={{ border: `1.5px solid ${on ? 'var(--color-accent)' : 'var(--color-neutral-500)'}` }}
      aria-hidden
    >
      {on && <span className="h-2 w-2 rounded-full" style={{ background: 'var(--color-accent)' }} />}
    </span>
  );
}

/**
 * Quiz runner — one question at a time (multiple choice, true/false or short
 * answer), free navigation between questions, then a single graded submit.
 */
export default function QuizRunner({ activity, onComplete, onAbandon }: ActivityRunnerProps) {
  const submitActivity = useLearningStore((s) => s.submitActivity);
  const content = activity.content as QuizContent | null;
  const questions = content?.questions ?? [];

  const [index, setIndex] = useState(() => {
    const d = readDraft(draftKey(activity.id));
    return Math.min(Math.max(0, d.index), (content?.questions.length ?? 1) - 1);
  });
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => readDraft(draftKey(activity.id)).answers);
  const draft = draftKey(activity.id);

  // Save the draft on every change (cheapest correct hook: write-behind on
  // state change, no debounce needed at this payload size).
  useEffect(() => {
    localStorage.setItem(draft, JSON.stringify({ index, answers }));
  }, [draft, index, answers]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Grading overlay progress: eased estimate asymptotic to 90% (grading is
  // one server LLM call — no real per-step progress; jumps to done on
  // completion because the overlay unmounts). ponytail: time-based; switch
  // to server streaming if grading ever becomes multi-step.
  const [gradePct, setGradePct] = useState(0);
  useEffect(() => {
    if (!submitting) return;
    const id = window.setInterval(() => {
      setGradePct((p) => p + Math.max(0.5, (90 - p) * 0.08));
    }, 400);
    return () => window.clearInterval(id);
  }, [submitting]);

  if (questions.length === 0) {
    return (
      <div className="card flex flex-col items-start gap-3 p-5">
        <p className="text-sm" style={{ opacity: 0.7 }}>
          This quiz has no questions — it may have failed to generate.
        </p>
        <button type="button" className="btn btn-secondary" onClick={onAbandon}>
          Back to strategies
        </button>
      </div>
    );
  }

  const total = questions.length;
  const q = questions[Math.min(index, total - 1)];
  const current = answers[q.id];
  const isLast = index === total - 1;
  const unanswered = questions.filter((qq) => !isAnswered(answers[qq.id])).length;
  const progress = ((index + 1) / total) * 100;

  const answer = (value: Answer) => setAnswers((a) => ({ ...a, [q.id]: value }));

  const submit = async () => {
    if (
      unanswered > 0 &&
      !window.confirm(`${unanswered} question${unanswered === 1 ? '' : 's'} unanswered — submit anyway?`)
    )
      return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, Answer> = {};
      for (const qq of questions) {
        const a = answers[qq.id];
        if (isAnswered(a)) payload[qq.id] = typeof a === 'string' ? a.trim() : a;
      }
      const result = await submitActivity(activity.id, { answers: payload });
      localStorage.removeItem(draft);
      onComplete(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not grade the quiz');
      setSubmitting(false);
    }
  };

  const optionStyle = (selected: boolean) => ({
    background: selected ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'var(--color-neutral-100)',
    border: `1px solid ${selected ? 'var(--color-accent)' : 'var(--color-neutral-300)'}`,
    borderRadius: 'var(--radius-md)',
  });

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs" style={{ opacity: 0.6 }}>
          <span>
            Question {index + 1} of {total}
          </span>
          <span>
            {total - unanswered}/{total} answered
          </span>
        </div>
        <div
          className="h-2 w-full overflow-hidden"
          style={{ background: 'var(--color-neutral-300)', borderRadius: 'var(--radius-sm)' }}
        >
          <div
            className="h-full transition-all duration-300"
            style={{ background: 'var(--color-accent)', width: `${progress}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {questions.map((qq, i) => {
            const done = isAnswered(answers[qq.id]);
            const cur = i === index;
            return (
              <button
                key={qq.id}
                type="button"
                onClick={() => setIndex(i)}
                disabled={submitting}
                aria-label={`Question ${i + 1}${done ? ' (answered)' : ''}`}
                aria-current={cur ? 'step' : undefined}
                className="h-6 w-6 text-[11px]"
                style={{
                  borderRadius: 999,
                  border: `1px solid ${cur ? 'var(--color-accent)' : 'var(--color-divider)'}`,
                  background: done ? 'color-mix(in srgb, var(--color-accent) 18%, transparent)' : 'transparent',
                  color: cur ? 'var(--color-accent)' : undefined,
                  opacity: done || cur ? 1 : 0.55,
                }}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Question */}
      <div
        className="card space-y-4"
        style={{ padding: 'var(--space-6)', opacity: submitting ? 0.6 : 1, pointerEvents: submitting ? 'none' : 'auto' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 text-xl leading-snug">
            <Markdown content={q.prompt} compact className="[&_p]:text-xl [&_p]:leading-snug" />
          </div>
          <span
            className="whitespace-nowrap px-2 py-1 text-xs"
            style={{ background: 'var(--color-neutral-200)', borderRadius: 'var(--radius-sm)', opacity: 0.75 }}
          >
            {TYPE_LABEL[q.qtype]}
          </span>
        </div>

        {q.qtype === 'mcq' && (
          <div className="space-y-2" role="radiogroup" aria-label="Options">
            {(q.options ?? []).map((opt, i) => {
              const on = current === opt;
              return (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => answer(opt)}
                  className="flex w-full items-center gap-3 p-3 text-left text-sm transition-colors hover:border-[var(--color-accent)]"
                  style={optionStyle(on)}
                >
                  <Radio on={on} />
                  <Markdown content={opt} compact />
                </button>
              );
            })}
          </div>
        )}

        {q.qtype === 'true_false' && (
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="True or false">
            {[true, false].map((v) => {
              const on = current === v;
              return (
                <button
                  key={String(v)}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => answer(v)}
                  className="flex items-center justify-center gap-2 p-4 text-base font-semibold transition-colors hover:border-[var(--color-accent)]"
                  style={optionStyle(on)}
                >
                  <Radio on={on} />
                  {v ? 'True' : 'False'}
                </button>
              );
            })}
          </div>
        )}

        {q.qtype === 'short_answer' && (
          <textarea
            value={typeof current === 'string' ? current : ''}
            onChange={(e) => answer(e.target.value)}
            placeholder="Type your answer — a sentence or two is plenty…"
            className="input resize-none"
            rows={4}
            aria-label="Your answer"
          />
        )}
      </div>

      {error && (
        <div
          className="text-sm"
          style={{
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
            color: 'var(--color-danger)',
          }}
        >
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={index === 0 || submitting}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          <HiChevronLeft className="h-4 w-4" />
          Prev
        </button>
        <div className="flex items-center gap-3">
          {isLast && unanswered > 0 && !submitting && (
            <span className="text-xs" style={{ color: 'var(--color-warning)' }}>
              {unanswered} unanswered
            </span>
          )}
          {!isLast ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={submitting}
              onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
            >
              Next
              <HiChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={submitting} onClick={submit}>
              {submitting ? 'Grading…' : 'Submit quiz'}
            </button>
          )}
        </div>
      </div>

      {submitting && (
        <div className="flex items-center gap-2 text-xs" style={{ opacity: 0.6 }}>
          <Spinner size="sm" />
          The tutor is grading your answers — short answers can take a few seconds.
        </div>
      )}

      {/* Grading overlay: full-screen blur + centered label + progress bar.
       * Grading is one server LLM call, so progress is an eased estimate that
       * asymptotes to 90% and jumps to done on completion (ponytail:
       * time-based; real per-step progress needs server streaming). */}
      {submitting &&
        createPortal(
          <div
            className="fixed inset-0 z-[9990] flex items-center justify-center backdrop-blur-md"
            style={{ background: 'color-mix(in srgb, var(--color-surface) 55%, transparent)' }}
            role="alert"
            aria-busy="true"
            aria-label="Your quiz is being graded"
          >
            <div className="flex w-[min(420px,calc(100%-3rem))] flex-col items-center gap-5">
              <h2 className="text-center text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
                Your quiz is being graded
              </h2>
              <div
                className="h-2 w-full overflow-hidden"
                style={{ background: 'var(--color-neutral-300)', borderRadius: 999 }}
              >
                <div
                  className="h-full transition-[width] duration-700 ease-out"
                  style={{ background: 'var(--color-accent)', width: `${gradePct}%`, borderRadius: 999 }}
                />
              </div>
              <span className="text-xs" style={{ opacity: 0.6 }}>
                The tutor is reading your answers…
              </span>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
