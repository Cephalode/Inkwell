import { useMemo, useState } from 'react';
import { HiArrowLeft, HiCheck, HiChevronRight, HiLightBulb, HiXMark } from 'react-icons/hi2';
import Markdown from '../shared/Markdown';
import { playCorrect, playWrong } from '../../lib/sounds';
import { FlowProgressDots as ProgressDots } from './ActivityOutcome';
import { useLearningStore } from '../../store/learningStore';
import {
  FLOW_SLOTS,
  FLOW_SLOT_META,
  type FlowLessonContent,
  type FlowQuizContent,
  type FlowSlot,
} from '../../types/learning';
import type { ActivityRunnerProps } from './runnerProps';

/** The account's slot progression, derived from completed flow activities. */
export function slotsDone(step: StepDetail): Set<FlowSlot> {
  const done = new Set<FlowSlot>();
  for (const a of step.activities) {
    if (a.kind !== 'flow' || a.status !== 'completed') continue;
    const slot = (a.result as { slot?: FlowSlot } | null)?.slot;
    if (slot) done.add(slot);
  }
  return done;
}

/** First incomplete slot — the app decides, no strategy picker. */
export function nextSlot(step: StepDetail): FlowSlot {
  const done = slotsDone(step);
  return FLOW_SLOTS.find((s) => !done.has(s)) ?? 'test'; // all done → replayable test
}

interface McqLike {
  prompt: string;
  options: string[];
  correct: string;
  explanation: string;
}

/** One instant-graded MCQ. Green/red on pick, explanation, no typing anywhere. */
function Mcq({ q, onAnswered, onHelp, helpText }: { q: McqLike; onAnswered?: (correct: boolean) => void; onHelp?: () => void; helpText?: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const answered = picked !== null;
  const wasRight = picked === q.correct;

  const openHelp = () => {
    if (!helpOpen) onHelp?.();
    setHelpOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="text-lg leading-snug font-medium">
        <Markdown content={q.prompt} compact />
      </div>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Options">
        {q.options.map((opt, i) => {
          const isPicked = picked === opt;
          const reveal = answered && opt === q.correct;
          const wrong = isPicked && opt !== q.correct;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={isPicked}
              disabled={answered}
              onClick={() => {
                setPicked(opt);
                onAnswered?.(opt === q.correct);
                (opt === q.correct ? playCorrect : playWrong)();
              }}
              className="flex min-h-20 w-full flex-col items-center justify-center gap-1.5 p-3 text-center text-sm transition-colors"
              style={{
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${reveal ? 'var(--color-success)' : wrong ? 'var(--color-danger)' : isPicked ? 'var(--color-accent)' : 'var(--color-neutral-300)'}`,
                background: reveal
                  ? 'color-mix(in srgb, var(--color-success) 12%, transparent)'
                  : wrong
                    ? 'color-mix(in srgb, var(--color-danger) 10%, transparent)'
                    : isPicked
                      ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)'
                      : 'var(--color-neutral-100)',
              }}
            >
              <span className="flex shrink-0 items-center justify-center" aria-hidden>
                {reveal ? (
                  <HiCheck className="h-5 w-5" style={{ color: 'var(--color-success)' }} />
                ) : wrong ? (
                  <HiXMark className="h-5 w-5" style={{ color: 'var(--color-danger)' }} />
                ) : (
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold"
                    style={{ border: '1px solid var(--color-neutral-400)' }}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                )}
              </span>
              <Markdown content={opt} compact />
            </button>
          );
        })}
      </div>
      {answered && (
        <div
          className="flex items-start gap-2 text-sm"
          style={{
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            background: `color-mix(in srgb, ${wasRight ? 'var(--color-success)' : 'var(--color-danger)'} 10%, transparent)`,
            color: wasRight ? 'var(--color-success)' : 'var(--color-danger)',
          }}
        >
          <span className="mt-0.5 shrink-0 font-semibold">{wasRight ? '✓ Correct' : '✗ Not quite'}</span>
          {q.explanation && (
            <span className="min-w-0 flex-1" style={{ color: 'var(--color-text)', opacity: 0.8 }}>
              {q.explanation}
            </span>
          )}
        </div>
      )}
      {!answered && helpText && (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ fontSize: 13 }}
          onClick={() => openHelp()}
          aria-expanded={helpOpen}
        >
          <HiLightBulb className="h-4 w-4" />
          I'm stuck — help
        </button>
      )}
      {!answered && helpOpen && helpText && (
        <div
          className="text-sm leading-relaxed"
          style={{
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'color-mix(in srgb, var(--color-warning) 10%, transparent)',
          }}
        >
          {helpText}
        </div>
      )}
    </div>
  );
}

/**
 * Guided-flow runner — the Duolingo-style alternative to the strategy picker.
 * Covers all 7 slots: Learn slots render a slide deck (teach → example → MCQ
 * per subject); Review/Test slots render pure MCQs with per-question help.
 * Progress lives on the account (completed flow activities), so the sequence
 * survives reloads and follows the user across devices.
 */
export default function FlowLesson({ activity, step, onComplete, onAbandon, onLeave }: ActivityRunnerProps) {
  const submitActivity = useLearningStore((s) => s.submitActivity);
  const content = activity.content as FlowLessonContent | FlowQuizContent | null;
  const slot = content?.slot ?? 'learn1'; // ponytail: pre-stamp activities lack it; learn1 is the safe default
  const meta = FLOW_SLOT_META[slot];

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Slide state (learn slots): position within the deck.
  const subjects = useMemo(() => (content && content.flow === 'lesson' ? content.subjects : []), [content]);
  const questions = useMemo(() => (content && content.flow === 'quiz' ? content.questions : []), [content]);
  const perSubject = 3; // teach → example → MCQ
  const slidesTotal = subjects.length * perSubject + 1; // + summary slide

  const [slide, setSlide] = useState(0);
  // Keyed by prompt so Back-nav + re-answering replaces the attempt instead of
  // double-counting it. Quiz questions repeat subjects, so the question prompt
  // (unique per question) is the right key there.
  const [attempts, setAttempts] = useState<Record<string, { subject: string; correct: boolean }>>({});
  const [hintsUsed, setHintsUsed] = useState(0);
  const attemptList = useMemo(() => Object.values(attempts), [attempts]);

  // Quiz state (review/test slots): linear, one question at a time.
  const [qi, setQi] = useState(0);

  if (!content) {
    return (
      <div className="card flex flex-col items-start gap-3 p-5">
        <p className="text-sm" style={{ opacity: 0.7 }}>
          This lesson has no content — it may have failed to generate.
        </p>
        <button type="button" className="btn btn-secondary" onClick={onAbandon}>
          Back to the roadmap
        </button>
      </div>
    );
  }

  const finish = async (usedHints: number) => {
    if (attemptList.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitActivity(activity.id, { slot, attempts: attemptList, hintsUsed: usedHints });
      onComplete(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this lesson');
      setSubmitting(false);
    }
  };

  const onMcqAnswered = (subject: string, correct: boolean) => {
    setAttempts((prev) => ({ ...prev, [subject]: { subject, correct } }));
  };

  const helpFor = (subject: string) => {
    const s = subjects.find((x) => x.title === subject);
    return s?.explanation ?? s?.example;
  };

  // ── Learn slots: slide deck ────────────────────────────────────────────────
  if (content.flow === 'lesson') {
    if (subjects.length === 0) {
      return (
        <div className="card flex flex-col items-start gap-3 p-5">
          <p className="text-sm" style={{ opacity: 0.7 }}>
            This lesson has no subjects — it may have failed to generate.
          </p>
          <button type="button" className="btn btn-secondary" onClick={onAbandon}>
            Back to the roadmap
          </button>
        </div>
      );
    }
    const isSummary = slide >= subjects.length * perSubject;
    const subjectIdx = Math.min(Math.floor(slide / perSubject), subjects.length - 1);
    const phase = slide % perSubject; // 0 teach · 1 example · 2 MCQ
    const subj = subjects[subjectIdx];
    const last = slide === slidesTotal - 1;

    return (
      <div className="space-y-4">
        <ProgressDots step={step} current={slot} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-accent)' }}>
            {meta.label} · {subj.title}
          </span>
          <span className="text-xs" style={{ opacity: 0.55 }}>
            {Math.min(slide + 1, slidesTotal)} / {slidesTotal}
          </span>
        </div>
        <div
          className="h-2 w-full overflow-hidden"
          style={{ background: 'var(--color-neutral-200)', borderRadius: 999 }}
          role="progressbar"
          aria-valuenow={Math.round(((slide + 1) / slidesTotal) * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full transition-all duration-300"
            style={{ background: 'var(--color-accent)', width: `${((slide + 1) / slidesTotal) * 100}%` }}
          />
        </div>

        <div className="card min-h-[320px] space-y-5" style={{ padding: 'var(--space-6)' }}>
          {isSummary ? (
            <>
              <h3 className="text-2xl font-semibold">Lesson complete 🎉</h3>
              <p className="text-sm" style={{ opacity: 0.7 }}>
                You answered {attemptList.filter((a) => a.correct).length} of {attemptList.length} checks right. The next
                lesson will focus on whatever slipped — keep going.
              </p>
              {attemptList.length > 0 && (
                <ul className="space-y-1.5">
                  {subjects.map((s) => {
                    const a = attempts[s.title];
                    if (!a) return null;
                    return (
                      <li key={s.id} className="flex items-center gap-2 text-sm">
                        {a.correct ? (
                          <HiCheck className="h-4 w-4 shrink-0" style={{ color: 'var(--color-success)' }} />
                        ) : (
                          <HiXMark className="h-4 w-4 shrink-0" style={{ color: 'var(--color-danger)' }} />
                        )}
                        {s.title}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : phase === 0 ? (
            <>
              <div className="card-kicker">Concept</div>
              <h3 className="text-2xl leading-tight font-semibold">{subj.title}</h3>
              <div className="leading-relaxed">
                <Markdown content={subj.explanation} />
              </div>
              {subj.diagram && (
                <div
                  className="mx-auto max-w-xl overflow-hidden rounded-md [&_svg]:h-auto [&_svg]:max-h-[220px] [&_svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: subj.diagram }}
                />
              )}
            </>
          ) : phase === 1 ? (
            <>
              <div className="card-kicker">Example</div>
              <h3 className="text-xl leading-tight font-semibold">{subj.title}</h3>
              <div
                className="leading-relaxed"
                style={{
                  padding: '14px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'color-mix(in srgb, var(--color-accent) 7%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
                }}
              >
                <Markdown content={subj.example} />
              </div>
              {subj.exampleDiagram && (
                <div
                  className="mx-auto max-w-xl overflow-hidden rounded-md [&_svg]:h-auto [&_svg]:max-h-[220px] [&_svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: subj.exampleDiagram }}
                />
              )}
            </>
          ) : (
            <>
              <div className="card-kicker">Quick check</div>
              <Mcq
                q={subj.mcq}
                onAnswered={(correct) => onMcqAnswered(subj.title, correct)}
              />
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={slide === 0 || submitting}
            onClick={() => setSlide((s) => Math.max(0, s - 1))}
          >
            <HiArrowLeft className="h-4 w-4" />
            Back
          </button>
          {last ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={submitting || attemptList.length === 0}
              title={attemptList.length === 0 ? 'Answer the quick checks first' : undefined}
              onClick={() => void finish(hintsUsed)}
            >
              {submitting ? 'Saving…' : 'Finish lesson'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={submitting || (phase === 2 && attempts[subj.title] === undefined)}
              title={phase === 2 && attempts[subj.title] === undefined ? 'Answer the quick check to continue' : undefined}
              onClick={() => setSlide((s) => s + 1)}
            >
              Continue
              <HiChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
        {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
        <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={onLeave}>
          Leave for now — progress is saved
        </button>
      </div>
    );
  }

  // ── Review/Test slots: pure quiz ───────────────────────────────────────────
  if (questions.length === 0) {
    return (
      <div className="card flex flex-col items-start gap-3 p-5">
        <p className="text-sm" style={{ opacity: 0.7 }}>
          This quiz has no questions — it may have failed to generate.
        </p>
        <button type="button" className="btn btn-secondary" onClick={onAbandon}>
          Back to the roadmap
        </button>
      </div>
    );
  }
  const q = questions[Math.min(qi, questions.length - 1)];
  const isLastQ = qi === questions.length - 1;
  const qAnswered = attempts[q.prompt] !== undefined;
  // Quiz questions can repeat a subject (focus weighting) — every question
  // counts, keyed by its prompt.
  const recordQuizAnswer = (subject: string, correct: boolean, prompt: string) => {
    setAttempts((prev) => ({ ...prev, [prompt]: { subject, correct } }));
  };

  return (
    <div className="space-y-4">
      <ProgressDots step={step} current={slot} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-accent)' }}>
          {meta.label} · {q.subject}
        </span>
        <span className="text-xs" style={{ opacity: 0.55 }}>
          {qi + 1} / {questions.length}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden"
        style={{ background: 'var(--color-neutral-200)', borderRadius: 999 }}
        role="progressbar"
        aria-valuenow={Math.round(((qi + 1) / questions.length) * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full transition-all duration-300"
          style={{ background: 'var(--color-accent)', width: `${((qi + 1) / questions.length) * 100}%` }}
        />
      </div>

      <div className="card min-h-[240px] space-y-5" style={{ padding: 'var(--space-6)' }}>
        <Mcq
          key={q.id}
          q={q}
          onAnswered={(correct) => recordQuizAnswer(q.subject, correct, q.prompt)}
          onHelp={() => setHintsUsed((h) => h + 1)}
          helpText={helpFor(q.subject)}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={qi === 0 || submitting}
          onClick={() => setQi((i) => Math.max(0, i - 1))}
        >
          <HiArrowLeft className="h-4 w-4" />
          Back
        </button>
        {isLastQ ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting || attemptList.length === 0}
            onClick={() => void finish(hintsUsed)}
          >
            {submitting ? 'Saving…' : slot === 'test' ? 'Finish test' : 'Finish review'}
          </button>
          ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting || !qAnswered}
            title={!qAnswered ? 'Answer to continue' : undefined}
            onClick={() => setQi((i) => i + 1)}
          >
            Continue
            <HiChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
      {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={onLeave}>
        Leave for now — progress is saved
      </button>
    </div>
  );
}
