import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HiArrowLeft, HiCheck, HiChevronRight, HiLightBulb, HiSpeakerWave, HiStop, HiXMark } from 'react-icons/hi2';
import Markdown from '../shared/Markdown';
import Spinner from '../shared/Spinner';
import { playCorrect, playWrong } from '../../lib/sounds';
import { nextRedoQueue, type RedoItem } from '../../lib/flowSequence';
import { stopSpeak, speakAll } from '../shared/SelectionTTS';
import { buildSpeakable, chunkSpeechText } from '../../utils/speechText';
import { FlowProgressDots as ProgressDots } from './ActivityOutcome';
import { useLearningStore } from '../../store/learningStore';
import {
  FLOW_SLOT_META,
  type FlowLessonContent,
  type FlowQuizContent,
} from '../../types/learning';
import type { ActivityRunnerProps } from './runnerProps';

interface McqLike {
  prompt: string;
  options: string[];
  correct: string;
  explanation: string;
}

/** One instant-graded MCQ. Green/red on pick, explanation, no typing anywhere. */
function Mcq({ q, onAnswered, onHelp, helpText }: { q: McqLike; onAnswered?: (correct: boolean, picked: string) => void; onHelp?: () => void; helpText?: string }) {
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
                onAnswered?.(opt === q.correct, opt);
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
export default function FlowLesson({ activity, step, onComplete, onAbandon, onLeave, onReplay }: ActivityRunnerProps) {
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
  // (unique per question) is the right key there. Each attempt carries the
  // prompt + picked answer so the server's wrong-answer log gets real text.
  const [attempts, setAttempts] = useState<Record<string, { subject: string; correct: boolean; prompt: string; answer: string }>>({});
  const [hintsUsed, setHintsUsed] = useState(0);
  const attemptList = useMemo(() => Object.values(attempts), [attempts]);

  // ── Redo phase: repeat first-pass misses until every one is answered right.
  // Client-side only — `attempts` (the graded record + wrong-answer bank) is
  // frozen after the main pass, so retries never change the score or the log.
  // Misses append to `redoQueue` during the main pass; `redoPhase` flips when
  // the learner hits Retry. `missedCount` drives the Retry button.
  const [redoQueue, setRedoQueue] = useState<RedoItem[]>([]);
  const [redoPhase, setRedoPhase] = useState(false);
  const redoSeen = useRef<Set<string>>(new Set()); // prompts already queued (first pass)
  const [missedCount, setMissedCount] = useState(0);
  const missCount = Object.values(attempts).filter((a) => !a.correct).length;

  // Quiz state (review/test slots): linear, one question at a time.
  const [qi, setQi] = useState(0);

  // ── Read mode (learn slots) ──────────────────────────────────────────────
  // Speaks the current card: Concept → its Example → the Quick check prompt +
  // options ONCE (no spoiler of the right answer), then WAITS for the answer.
  // "Continue" moves on and the read follows the deck to the summary. Any
  // manual navigation (Back/Continue/dots) re-reads the newly shown card.
  // Same token-ref invalidation pattern as SlidesRunner.
  const [readMode, setReadMode] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const tokenRef = useRef(0);
  const slideRef = useRef(slide);
  const readModeRef = useRef(readMode);
  const subjectsRef = useRef(subjects);
  const perSubjectRef = useRef(perSubject);
  useEffect(() => { slideRef.current = slide; }, [slide]);
  useEffect(() => { readModeRef.current = readMode; }, [readMode]);
  useEffect(() => { subjectsRef.current = subjects; }, [subjects]);
  useEffect(() => { perSubjectRef.current = perSubject; }, [perSubject]);

  /** The current card → speakable text (null = nothing to say on this card). */
  const cardSpeech = useCallback((idx: number): string | null => {
    const subs = subjectsRef.current;
    const per = perSubjectRef.current;
    if (idx >= subs.length * per) return null; // summary slide — nothing to read
    const subject = subs[Math.min(Math.floor(idx / per), subs.length - 1)];
    const phase = idx % per;
    if (phase === 0) {
      const parts = [`Concept. ${subject.title}.`, buildSpeakable(subject.explanation)];
      return parts.join(' ');
    }
    if (phase === 1) return `Example. ${buildSpeakable(subject.example)}`;
    // Quick check: prompt + options, never the answer.
    const mcq = subject.mcq;
    const opts = mcq.options.map((o, n) => `Option ${String.fromCharCode(65 + n)}: ${buildSpeakable(o)}`).join('. ');
    return `Quick check. ${buildSpeakable(mcq.prompt)} ${opts}`;
  }, []);

  /** Read card `idx` — ONE card per trigger, no auto-advance. Continue and
   * Back re-read the newly shown card while read mode is on. */
  const readFrom = useCallback(async (idx: number, token: number) => {
    if (token !== tokenRef.current) return;
    const text = cardSpeech(idx);
    if (!text) { setSpeaking(false); return; } // summary — nothing to read
    setSpeaking(true);
    setReadError(null);
    try {
      await speakAll(chunkSpeechText(text));
    } catch {
      if (token === tokenRef.current) {
        setSpeaking(false);
        setReadError('Read-aloud failed — the lesson is still readable.');
      }
      return;
    }
    // Leave the audio element fully stopped (a lingering src can keep playing).
    if (token === tokenRef.current) {
      tokenRef.current += 1;
      stopSpeak();
      setSpeaking(false);
    }
  }, [cardSpeech]);

  /** Kill any in-flight read. */
  const abortRead = useCallback(() => {
    tokenRef.current += 1;
    stopSpeak();
    setSpeaking(false);
  }, []);

  /** Toggle read mode. On: starts at the current card. Off: stops. */
  const toggleRead = useCallback(() => {
    if (readModeRef.current) {
      setReadMode(false);
      abortRead();
      return;
    }
    setReadMode(true);
    readModeRef.current = true;
    tokenRef.current += 1;
    void readFrom(slideRef.current, tokenRef.current);
  }, [abortRead, readFrom]);

  // Single nav entry point: clamps, syncs slideRef (rapid clicks stay
  // accurate), and in read mode re-reads the newly shown card. The Continue
  // handler calls the raw setSlide instead when a read should keep running
  // (readFrom already advanced through teach/example pairs).
  const goTo = useCallback(
    (n: number) => {
      const next = Math.max(0, n);
      if (next === slideRef.current) return;
      slideRef.current = next;
      setSlide(next);
      if (readModeRef.current) {
        tokenRef.current += 1;
        stopSpeak();
        void readFrom(next, tokenRef.current);
      }
    },
    [readFrom],
  );

  // Leaving the runner stops speech unconditionally — a `speaking` guard
  // races the between-cards gap and leaks a playing element (seen live in
  // SlidesRunner).
  useEffect(
    () => () => {
      tokenRef.current += 1;
      stopSpeak();
    },
    [],
  );

  // Revisit mode: a replay of an already-completed lesson (opened from its
  // pill). Graded locally, never re-submitted — score/credit are frozen.
  const replay = !!content && (content as { replay?: boolean }).replay === true;

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

  const onMcqAnswered = (subject: string, correct: boolean, prompt = '', answer = '') => {
    setAttempts((prev) => ({ ...prev, [subject]: { subject, correct, prompt, answer } }));
    // First pass only: queue the miss for the end-of-lesson redo.
    if (!redoPhase && prompt && !redoSeen.current.has(prompt)) {
      const q = subjects.find((s) => s.title === subject)?.mcq;
      if (q && !correct) {
        redoSeen.current.add(prompt);
        setMissedCount((c) => c + 1);
        setRedoQueue((prev) => [...prev, { subject, prompt: q.prompt, options: q.options, correct: q.correct, explanation: q.explanation }]);
      }
    }
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

    // Redo phase (after the summary slide): repeat first-pass misses until
    // every one is answered right, then Finish.
    if (isSummary && redoPhase) {
      const current = redoQueue[0];
      if (!current) {
        // Queue empty — every miss has been redone correctly.
        return (
          <div className="space-y-4">
            <ProgressDots step={step} current={slot} onReplay={onReplay} />
            <div className="card space-y-3" style={{ padding: 'var(--space-6)' }}>
              <h3 className="text-2xl font-semibold">{replay ? 'Refresher complete 🎉' : 'Lesson complete 🎉'}</h3>
              <p className="text-sm" style={{ opacity: 0.7 }}>
                You answered {attemptList.filter((a) => a.correct).length} of {attemptList.length} checks right
                {replay
                  ? ' — your recorded score stands.'
                  : ` and worked through the ${missCount} you missed. The next lesson will focus on whatever slipped — keep going.`}
              </p>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span />
              {replay ? (
                <button type="button" className="btn btn-primary" onClick={onLeave}>
                  Done
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={submitting || attemptList.length === 0}
                  onClick={() => void finish(hintsUsed)}
                >
                  {submitting ? 'Saving…' : 'Finish lesson'}
                </button>
              )}
            </div>
            {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
            {!replay && (
              <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={onLeave}>
                Leave for now — progress is saved
              </button>
            )}
          </div>
        );
      }
      return (
        <div className="space-y-4">
          <ProgressDots step={step} current={slot} onReplay={onReplay} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-accent)' }}>
              Let's try that again · {current.subject}
            </span>
            <span className="text-xs" style={{ opacity: 0.55 }}>
              {redoQueue.length} to retry
            </span>
          </div>
          <div className="card min-h-[240px] space-y-5" style={{ padding: 'var(--space-6)' }}>
            <Mcq
              key={current.prompt}
              q={current}
              onAnswered={(correct) => setRedoQueue((q) => nextRedoQueue(q ?? [], current.prompt, correct))}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs" style={{ opacity: 0.55 }}>
              Answer right to clear it — these don't change your score
            </span>
          </div>
          {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={onLeave}>
            Leave for now — progress is saved
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <ProgressDots step={step} current={slot} onReplay={onReplay} />
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
              {redoQueue && redoQueue.length > 0 && (
                <p className="text-sm" style={{ color: 'var(--color-accent)', margin: 0 }}>
                  {redoQueue.length} quick check{redoQueue.length === 1 ? '' : 's'} to retry before you finish.
                </p>
              )}
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
                onAnswered={(correct, picked) => onMcqAnswered(subj.title, correct, subj.mcq.prompt, picked)}
              />
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={slide === 0 || submitting}
              onClick={() => goTo(slide - 1)}
            >
              <HiArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              type="button"
              className={`btn ${readMode ? 'btn-primary' : 'btn-secondary'}`}
              onClick={toggleRead}
              aria-pressed={readMode}
              title={readMode ? 'Stop read-aloud' : 'Read the lesson aloud — follows along as you continue'}
            >
              {speaking ? <Spinner size="sm" /> : readMode ? <HiStop className="h-4 w-4" aria-hidden /> : <HiSpeakerWave className="h-4 w-4" aria-hidden />}
              {readMode ? (speaking ? 'Reading…' : 'Read on') : 'Read'}
            </button>
          </div>
          {last ? (
            missedCount > 0 ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  // Enter the redo phase: repeat every first-pass miss until
                  // each is answered right (queue was built during the pass).
                  abortRead();
                  setRedoPhase(true);
                }}
              >
                Retry {missedCount} missed check{missedCount === 1 ? '' : 's'}
                <HiChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={submitting || attemptList.length === 0}
                title={attemptList.length === 0 ? 'Answer the quick checks first' : undefined}
                onClick={() => {
                  abortRead();
                  void finish(hintsUsed);
                }}
              >
                {submitting ? 'Saving…' : 'Finish lesson'}
              </button>
            )
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={submitting || (phase === 2 && attempts[subj.title] === undefined)}
              title={phase === 2 && attempts[subj.title] === undefined ? 'Answer the quick check to continue' : undefined}
              onClick={() => {
                const next = slide + 1;
                slideRef.current = next;
                setSlide(next);
                // In read mode the next card reads automatically: the read
                // loop is either still parked after a quick check (token
                // alive) or was stopped by nav — restart it at the new card.
                if (readModeRef.current) {
                  tokenRef.current += 1;
                  stopSpeak();
                  void readFrom(next, tokenRef.current);
                }
              }}
            >
              Continue
              <HiChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
        {readError && (
          <p className="text-xs" style={{ color: 'var(--color-danger)', opacity: 0.85 }}>{readError}</p>
        )}
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
  // ── Review/Test slots: pure quiz ───────────────────────────────────────────
  const q = questions[Math.min(qi, questions.length - 1)];
  const isLastQ = qi === questions.length - 1;
  const qAnswered = attempts[q.prompt] !== undefined;
  // Quiz questions can repeat a subject (focus weighting) — every question
  // counts, keyed by its prompt.
  const recordQuizAnswer = (subject: string, correct: boolean, prompt: string, answer: string) => {
    setAttempts((prev) => ({ ...prev, [prompt]: { subject, correct, prompt, answer } }));
    // First pass only: queue the miss for the end-of-quiz redo.
    if (!redoPhase && !redoSeen.current.has(prompt) && !correct) {
      redoSeen.current.add(prompt);
      setMissedCount((c) => c + 1);
      const missed = questions.find((x) => x.prompt === prompt);
      if (missed) {
        setRedoQueue((prev) => [
          ...prev,
          { subject, prompt: missed.prompt, options: missed.options, correct: missed.correct, explanation: missed.explanation },
        ]);
      }
    }
  };

  // Redo phase (after the last question): repeat first-pass misses until every
  // one is answered right, then Finish. Score stays the first-pass record.
  if (redoPhase) {
    const current = redoQueue[0];
    if (!current) {
      return (
        <div className="space-y-4">
          <ProgressDots step={step} current={slot} onReplay={onReplay} />
          <div className="card space-y-3" style={{ padding: 'var(--space-6)' }}>
            <h3 className="text-2xl font-semibold">{replay ? 'Refresher complete 🎉' : 'Review complete 🎉'}</h3>
            <p className="text-sm" style={{ opacity: 0.7 }}>
              {replay
                ? `You answered ${attemptList.filter((a) => a.correct).length} of ${attemptList.length} right — your recorded score stands.`
                : `You answered ${attemptList.filter((a) => a.correct).length} of ${attemptList.length} right — and worked each miss until you got it.`}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span />
            {replay ? (
              <button type="button" className="btn btn-primary" onClick={onLeave}>
                Done
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={submitting || attemptList.length === 0}
                onClick={() => void finish(hintsUsed)}
              >
                {submitting ? 'Saving…' : slot === 'test' ? 'Finish test' : 'Finish review'}
              </button>
            )}
          </div>
          {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
          {!replay && (
            <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={onLeave}>
              Leave for now — progress is saved
            </button>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <ProgressDots step={step} current={slot} onReplay={onReplay} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-accent)' }}>
            Let's try that again · {current.subject}
          </span>
          <span className="text-xs" style={{ opacity: 0.55 }}>
            {redoQueue.length} to retry
          </span>
        </div>
        <div className="card min-h-[240px] space-y-5" style={{ padding: 'var(--space-6)' }}>
          <Mcq
            key={current.prompt}
            q={current}
            onAnswered={(correct) => setRedoQueue((qq) => nextRedoQueue(qq ?? [], current.prompt, correct))}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs" style={{ opacity: 0.55 }}>
            Answer right to clear it — these don't change your score
          </span>
        </div>
        {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
        <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={onLeave}>
          Leave for now — progress is saved
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ProgressDots step={step} current={slot} onReplay={onReplay} />
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
          onAnswered={(correct, picked) => recordQuizAnswer(q.subject, correct, q.prompt, picked ?? '')}
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
          missedCount > 0 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                // Enter the redo phase: repeat every first-pass miss until
                // each is answered right (queue was built during the pass).
                setRedoPhase(true);
              }}
            >
              Retry {missedCount} missed question{missedCount === 1 ? '' : 's'}
              <HiChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={submitting || attemptList.length === 0}
              onClick={() => void finish(hintsUsed)}
            >
              {submitting ? 'Saving…' : slot === 'test' ? 'Finish test' : 'Finish review'}
            </button>
          )
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
