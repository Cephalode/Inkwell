import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiCheck,
  HiChevronDown,
  HiChevronLeft,
  HiChevronUp,
  HiOutlineArrowsRightLeft,
  HiOutlinePaperAirplane,
} from 'react-icons/hi2';
import AutoResizingTextarea from '../shared/AutoResizingTextarea';
import Badge from '../shared/Badge';
import ConfirmDialog from '../shared/ConfirmDialog';
import Markdown from '../shared/Markdown';
import Spinner from '../shared/Spinner';
import { MasteryBar, MasteryPill } from './ActivityOutcome';
import { useDiscussionSession } from './useDiscussionSession';
import { useVideoStore } from '../../store/videoStore';
import {
  ACTIVITY_META,
  MASTERY_LABEL,
  type DiscussionAssessment,
  type DiscussionMessage,
  type LearningActivity,
  type StepDetail,
  type SubmitResponse,
} from '../../types/learning';

const VERDICT_BADGE: Record<DiscussionAssessment['verdict'], { color: 'green' | 'cyan' | 'yellow'; label: string }> = {
  learned: { color: 'green', label: 'Learned' },
  progressing: { color: 'cyan', label: 'Progressing' },
  struggling: { color: 'yellow', label: 'Struggling' },
};

/** Compact verdict / confidence / coverage line under a tutor turn. */
function AssessmentLine({ assessment }: { assessment: DiscussionAssessment }) {
  const badge = VERDICT_BADGE[assessment.verdict] ?? VERDICT_BADGE.progressing;
  const covered = assessment.coveredObjectives ?? [];
  const gaps = assessment.gaps ?? [];
  return (
    <div className="flex flex-col" style={{ gap: 4, marginTop: 'var(--space-2)', fontSize: 12 }}>
      <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
        <Badge color={badge.color}>{badge.label}</Badge>
        <span style={{ opacity: 0.55 }}>{Math.round((assessment.confidence ?? 0) * 100)}% confident</span>
      </div>
      {covered.length > 0 && (
        <div style={{ opacity: 0.6 }}>
          <span style={{ color: 'var(--color-success)' }}>Covered:</span> {covered.join(' · ')}
        </div>
      )}
      {gaps.length > 0 && (
        <div style={{ opacity: 0.6 }}>
          <span style={{ color: 'var(--color-warning)' }}>Still to show:</span> {gaps.join(' · ')}
        </div>
      )}
    </div>
  );
}

function Bubble({ message }: { message: DiscussionMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className="flex flex-col" style={{ maxWidth: '88%', gap: 3 }}>
        <div
          style={{
            fontSize: 10.5,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            opacity: 0.45,
            textAlign: isUser ? 'right' : 'left',
          }}
        >
          {isUser ? 'You' : 'Tutor'}
        </div>
        <div
          className={isUser ? 'whitespace-pre-wrap' : ''}
          style={{
            padding: '10px 12px',
            fontSize: 14,
            lineHeight: 1.55,
            borderRadius: 'var(--radius-lg)',
            background: isUser
              ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)'
              : 'color-mix(in srgb, var(--color-text) 5%, transparent)',
            border: `1px solid ${
              isUser ? 'color-mix(in srgb, var(--color-accent) 32%, transparent)' : 'var(--color-divider)'
            }`,
          }}
        >
          {isUser ? message.content : <Markdown content={message.content} />}
          {!isUser && message.assessment && <AssessmentLine assessment={message.assessment} />}
        </div>
      </div>
    </div>
  );
}

/** One context card in the right rail; each card scrolls independently. */
function ContextCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="card" style={{ padding: 'var(--space-3)', minHeight: 0, flexShrink: 0 }}>
      {title && (
        <h4 className="section-label" style={{ margin: '0 0 var(--space-2)' }}>
          {title}
        </h4>
      )}
      {children}
    </div>
  );
}

/** Sessions grid + evidence history — the sketch's "This session" card. */
function SessionCard({ step, messages }: { step: StepDetail; messages: DiscussionMessage[] }) {
  const userTurns = messages.filter((m) => m.role === 'user').length;
  const confidence = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const a = messages[i]?.assessment;
      if (a) return Math.round(a.confidence * 100);
    }
    return null;
  })();

  const evidence = [...step.evidence].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);

  return (
    <ContextCard title="This session">
      <div
        className="grid grid-cols-2"
        style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}
      >
        <div className="card" style={{ padding: '8px 10px' }}>
          <div style={{ fontSize: 17, fontWeight: 650 }}>{userTurns ?? 0}</div>
          <div className="text-xs" style={{ opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Turns
          </div>
        </div>
        <div className="card" style={{ padding: '8px 10px' }}>
          <div style={{ fontSize: 17, fontWeight: 650 }}>
            {step.objectives.length > 0 ? `${step.objectives.length} goals` : '—'}
          </div>
          <div className="text-xs" style={{ opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Objectives
          </div>
        </div>
        <div className="card" style={{ padding: '8px 10px' }}>
          <div style={{ fontSize: 17, fontWeight: 650 }}>{confidence != null ? `${confidence}%` : '—'}</div>
          <div className="text-xs" style={{ opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Confidence
          </div>
        </div>
        <div className="card" style={{ padding: '8px 10px' }}>
          <div style={{ fontSize: 17, fontWeight: 650 }}>+{ACTIVITY_META.discussion.xp}</div>
          <div className="text-xs" style={{ opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            XP on close
          </div>
        </div>
      </div>

      {evidence.length > 0 && (
        <>
          <h4 className="section-label" style={{ margin: '0 0 var(--space-1)' }}>
            History
          </h4>
          <div style={{ overflowY: 'auto', minHeight: 0 }}>
            {evidence.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between text-sm"
                style={{ gap: 'var(--space-2)', padding: '6px 0', borderTop: '1px solid var(--color-divider)' }}
              >
                <span className="min-w-0 truncate">
                  {e.kind === 'manual' ? 'Marked as known' : e.kind === 'video' ? 'Watched a video' : ACTIVITY_META[e.kind].label}
                </span>
                <span className="shrink-0 text-xs" style={{ opacity: 0.5 }}>
                  {new Date(e.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span
                  className="shrink-0 text-sm font-semibold"
                  style={{ color: 'var(--color-accent)', minWidth: 38, textAlign: 'right' }}
                >
                  {Math.round(e.score * 100)}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </ContextCard>
  );
}

/** The sketch's video suggestion card, fed by the real ranked-video store. */
function VideoSuggestCard({ step }: { step: StepDetail }) {
  const navigate = useNavigate();
  const data = useVideoStore((s) => s.videosBySkill[step.skillId]);
  const top = data?.videos?.[0];
  return (
    <div className="card" style={{ padding: 'var(--space-3)' }}>
      {top ? (
        <button
          type="button"
          className="flex w-full items-center text-left transition-colors hover:opacity-90"
          style={{ gap: 'var(--space-3)' }}
          onClick={() => navigate(`/learn/videos/${top.id}`)}
          title={top.title}
        >
          <span
            className="grid shrink-0 place-items-center"
            style={{
              width: 92,
              height: 54,
              borderRadius: 8,
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 55%, #000), var(--color-accent))',
            }}
          >
            <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" style={{ color: 'rgba(255,255,255,0.9)' }}>
              <path d="M8 5.5v13l11-6.5-11-6.5Z" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{top.title}</span>
            <span className="block text-xs" style={{ opacity: 0.5 }}>
              {top.channel} · {Math.max(1, Math.round(top.durationSeconds / 60))} min · suggested
            </span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          className="flex w-full items-center gap-3 text-left"
          onClick={() => navigate('/learn/videos')}
        >
          <span
            className="grid shrink-0 place-items-center"
            style={{
              width: 92,
              height: 54,
              borderRadius: 8,
              background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
            }}
          >
            <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" style={{ color: 'var(--color-accent)' }}>
              <path d="M8 5.5v13l11-6.5-11-6.5Z" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Find a video for this milestone</span>
            <span className="block text-xs" style={{ opacity: 0.5 }}>
              YouTube, judged by Inkwell
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

const CONFIRM_LEAVE_KEY = 'discussion-workspace-leave';
void CONFIRM_LEAVE_KEY;

/**
 * "Talk it through" as a full-page two-pane workspace (sketch 005 —
 * "B — Two-pane study"): context rail permanently visible on the LEFT,
 * the tutor chat on the RIGHT, each region scrolling independently so the
 * page never scrolls. Below ~900px the panes stack (rail after the chat).
 */
export default function DiscussionWorkspace({
  activity,
  step,
  onComplete,
  onAbandon,
}: {
  activity: LearningActivity;
  step: StepDetail;
  onComplete: (result: SubmitResponse) => void;
  onAbandon: () => void;
}) {
  const navigate = useNavigate();
  const session = useDiscussionSession(activity);
  const [stacked, setStacked] = useState(
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 900px)').matches : false,
  );
  const [keyPointsOpen, setKeyPointsOpen] = useState(false);
  const completedRef = useRef(false);

  // Auto-scroll the transcript to the latest turn.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = panelRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session.messages.length, session.pending, session.sending, session.closed]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const onChange = (e: MediaQueryListEvent) => setStacked(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Hand the outcome to the page exactly once (the closing turn IS the submit).
  const finish = (result: SubmitResponse) => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete(result);
  };

  const masteryPct = Math.round(step.skill.masteryScore * 100);
  const meta = ACTIVITY_META.discussion;
  const nextTarget = step.nextStepId ?? (step.roadmapNextStepId !== step.id ? step.roadmapNextStepId : null);

  const onSend = async () => {
    const turn = await session.send();
    if (turn?.done && turn.skill && turn.profile) finish(turn as unknown as SubmitResponse);
  };

  const onEnd = async () => {
    const result = await session.endSession();
    if (result) finish(result);
  };

  const transcript = (
    <div
      ref={panelRef}
      className="card flex flex-col"
      style={{
        flex: 1,
        minHeight: 0,
        gap: 'var(--space-3)',
        padding: 'var(--space-3)',
        overflowY: 'auto',
      }}
      aria-live="polite"
    >
      {session.messages.length === 0 && !session.pending && (
        <div className="text-center" style={{ fontSize: 13, opacity: 0.45, padding: 'var(--space-6) 0' }}>
          Say hello to get the discussion going.
        </div>
      )}
      {session.messages.map((m, i) => (
        <Bubble key={`${m.at}-${i}`} message={m} />
      ))}
      {session.pending && <Bubble message={{ role: 'user', content: session.pending, at: '' }} />}
      {session.sending && (
        <div className="flex items-center" style={{ gap: 'var(--space-2)', fontSize: 13, opacity: 0.55 }}>
          <Spinner size="sm" />
          Tutor is thinking…
        </div>
      )}
    </div>
  );

  const composer = session.closed ? (
    <div
      className="card flex flex-wrap items-center justify-between"
      style={{ padding: 'var(--space-3) var(--space-4)', gap: 'var(--space-3)' }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>This session is closed</div>
        <div style={{ fontSize: 13, opacity: 0.55 }}>The tutor has made its call — the transcript stays here for reference.</div>
      </div>
      <button type="button" className="btn btn-secondary" onClick={onAbandon}>
        Back
      </button>
    </div>
  ) : (
    <div className="flex items-end" style={{ gap: 'var(--space-2)' }}>
      <AutoResizingTextarea
        value={session.draft}
        onChange={(e) => session.setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void onSend();
          }
        }}
        placeholder="Answer the tutor in your own words… (Enter to send, Shift+Enter for a new line)"
        minHeight={44}
        maxHeight={200}
        disabled={session.busy}
        aria-label="Your reply"
        style={{ fontSize: 14, lineHeight: 1.5 }}
      />
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => void onSend()}
        disabled={session.busy || !session.draft.trim()}
        style={{ minHeight: 44 }}
        aria-label="Send"
      >
        <HiOutlinePaperAirplane size={16} />
        <span>Send</span>
      </button>
    </div>
  );

  const chatCol = (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        minHeight: 0,
        minWidth: 0,
        flex: stacked ? '1 1 auto' : '1 1 0',
        order: stacked ? 2 : 1,
      }}
    >
      {/* Page head */}
      <div className="flex items-baseline" style={{ gap: 'var(--space-3)', padding: '0 2px' }}>
        <button
          type="button"
          className="btn btn-ghost min-w-0"
          style={{ fontSize: 12.5, padding: '2px 8px' }}
          onClick={() => navigate(`/courses/${step.courseId}`)}
          title={step.courseName}
        >
          <HiChevronLeft className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{step.courseName}</span>
        </button>
        <span style={{ fontSize: 12, opacity: 0.45, whiteSpace: 'nowrap' }}>·</span>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ fontSize: 12.5, padding: '2px 8px' }}
          disabled={!step.prevStepId}
          onClick={() => step.prevStepId && navigate(`/learn/steps/${step.prevStepId}`)}
        >
          Prev
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ fontSize: 12.5, padding: '2px 8px' }}
          disabled={!nextTarget}
          onClick={() => nextTarget && navigate(`/learn/steps/${nextTarget}`)}
        >
          Next
        </button>
        <span style={{ flex: 1 }} />
        {!session.closed && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: 12.5 }}
            disabled={session.busy}
            onClick={() => session.setConfirmOpen(true)}
          >
            {session.ending ? 'Ending…' : 'End session'}
          </button>
        )}
      </div>

      <div className="flex items-baseline flex-wrap" style={{ gap: 'var(--space-2)', padding: '0 2px' }}>
        <h1 style={{ fontSize: 24, margin: 0, fontWeight: 650 }}>{step.title}</h1>
        <span className="card-kicker">{meta.emoji} {meta.label}</span>
        <span style={{ fontSize: 12.5, opacity: 0.5 }}>{session.turnLabel}</span>
        <span style={{ fontSize: 12.5, opacity: 0.5 }}>· +{meta.xp} XP</span>
      </div>

      {transcript}
      {composer}

      <ConfirmDialog
        open={session.confirmOpen}
        title="End this session?"
        message="The tutor will grade what you've shown so far. You can't reopen the discussion afterwards."
        confirmLabel="End session"
        cancelLabel="Keep going"
        onConfirm={() => void onEnd()}
        onCancel={() => session.setConfirmOpen(false)}
      />
    </section>
  );

  const contextRail = (
    <aside
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        minHeight: 0,
        minWidth: 0,
        flex: stacked ? '1 1 auto' : '0 0 320px',
        width: stacked ? '100%' : undefined,
        order: stacked ? 1 : 2,
      }}
    >
      {/* Mastery card */}
      <ContextCard>
        <div className="flex items-center" style={{ gap: 'var(--space-3)' }}>
          <MasteryPill mastery={step.skill.mastery} />
          <div className="flex min-w-0 flex-1 items-center" style={{ gap: 'var(--space-2)' }}>
            <MasteryBar score={step.skill.masteryScore} mastery={step.skill.mastery} />
            <span style={{ fontSize: 12, fontWeight: 600, minWidth: 32, textAlign: 'right' }}>{masteryPct}%</span>
          </div>
        </div>
        <div style={{ marginTop: 'var(--space-2)', fontSize: 11.5, opacity: 0.55 }}>
          {MASTERY_LABEL[step.skill.mastery]} · {step.courseName}
        </div>
        {step.alsoIn.length > 0 && (
          <div className="flex flex-wrap items-center" style={{ gap: 6, marginTop: 'var(--space-2)', fontSize: 11.5 }}>
            <HiOutlineArrowsRightLeft style={{ opacity: 0.6 }} />
            <span style={{ opacity: 0.55 }}>Also taught in</span>
            {step.alsoIn.map((c) => (
              <button
                key={c.stepId}
                type="button"
                onClick={() => navigate(`/learn/steps/${c.stepId}`)}
                className="truncate transition-colors hover:text-[var(--color-accent)]"
                style={{
                  fontSize: 11,
                  border: '1px solid var(--color-divider)',
                  borderRadius: 999,
                  padding: '1px 8px',
                  cursor: 'pointer',
                  background: 'none',
                  color: 'inherit',
                }}
              >
                {c.courseName} →
              </button>
            ))}
          </div>
        )}
      </ContextCard>

      {/* Objectives card with key-points disclosure */}
      {(step.objectives.length > 0 || step.keyPoints.length > 0) && (
        <ContextCard title="What you'll be able to do">
          {step.objectives.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {step.objectives.map((o, i) => (
                <li key={i} className="flex items-start text-sm" style={{ gap: 8 }}>
                  <HiCheck style={{ marginTop: 3, flexShrink: 0, width: 14, height: 14, color: 'var(--color-accent)' }} />
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          )}
          {step.keyPoints.length > 0 && (
            <div style={{ marginTop: 'var(--space-2)' }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '2px 4px', fontSize: 12 }}
                aria-expanded={keyPointsOpen}
                onClick={() => setKeyPointsOpen((o) => !o)}
              >
                {keyPointsOpen ? <HiChevronUp className="h-3.5 w-3.5" /> : <HiChevronDown className="h-3.5 w-3.5" />}
                Key points ({step.keyPoints.length})
              </button>
              {keyPointsOpen && (
                <ul className="ml-5 list-disc" style={{ marginTop: 6, fontSize: 12, opacity: 0.75, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {step.keyPoints.map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </ContextCard>
      )}

      {/* Session stats + history */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <SessionCard step={step} messages={session.messages} />
      </div>

      {/* Video suggestion */}
      <VideoSuggestCard step={step} />
    </aside>
  );

  return (
    <div
      className="mx-auto w-full"
      style={{
        display: 'flex',
        flexDirection: stacked ? 'column' : 'row',
        gap: 'var(--space-4)',
        height: stacked ? 'auto' : 'calc(100vh - var(--header-height, 0px) - 48px)',
        minHeight: 480,
        maxWidth: 1400,
      }}
      data-leave-confirm={CONFIRM_LEAVE_KEY}
    >
      {chatCol}
      {contextRail}
    </div>
  );
}
