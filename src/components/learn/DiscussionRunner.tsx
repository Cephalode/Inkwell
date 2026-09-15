import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { HiOutlinePaperAirplane } from 'react-icons/hi2';
import AutoResizingTextarea from '../shared/AutoResizingTextarea';
import Badge from '../shared/Badge';
import ConfirmDialog from '../shared/ConfirmDialog';
import Markdown from '../shared/Markdown';
import Spinner from '../shared/Spinner';
import { useLearningStore } from '../../store/learningStore';
import type {
  DiscussionAssessment,
  DiscussionContent,
  DiscussionMessage,
  LearningActivity,
  SubmitResponse,
} from '../../types/learning';
import type { ActivityRunnerProps } from './runnerProps';

const VERDICT_BADGE: Record<DiscussionAssessment['verdict'], { color: 'green' | 'cyan' | 'yellow'; label: string }> = {
  learned: { color: 'green', label: 'Learned' },
  progressing: { color: 'cyan', label: 'Progressing' },
  struggling: { color: 'yellow', label: 'Struggling' },
};

const EMPTY_CONTENT: DiscussionContent = { messages: [], closed: false, maxTurns: 0 };

function contentOf(activity: LearningActivity | null): DiscussionContent | null {
  const c = activity?.content as DiscussionContent | null | undefined;
  return c && Array.isArray(c.messages) ? c : null;
}

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

/**
 * Socratic tutor chat. The transcript lives in `activity.content`; every turn
 * the server returns the updated activity plus an assessment, and once the
 * tutor is convinced (or turns run out) the turn response is also the
 * `SubmitResponse` that closes the activity.
 */
export default function DiscussionRunner({ activity, onComplete, onAbandon }: ActivityRunnerProps) {
  // Freshest transcript: what the server returned for our last turn, unless
  // the prop (refreshed by the page) has caught up or moved past it.
  const [latest, setLatest] = useState<LearningActivity | null>(null);
  const propContent = contentOf(activity) ?? EMPTY_CONTENT;
  const localContent = latest && latest.id === activity.id ? contentOf(latest) : null;
  const content =
    localContent && localContent.messages.length >= propContent.messages.length ? localContent : propContent;
  const { messages, maxTurns } = content;
  const closed =
    content.closed || activity.status === 'completed' || (latest?.id === activity.id && latest.status === 'completed');

  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = sending || ending;

  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = panelRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending, sending, closed]);

  const userTurns = messages.filter((m) => m.role === 'user').length;
  const turnLabel = closed
    ? `${userTurns} of ${maxTurns} turns`
    : `Turn ${Math.min(userTurns + 1, Math.max(maxTurns, 1))} of ${maxTurns}`;

  const send = async () => {
    const text = draft.trim();
    if (!text || busy || closed) return;
    setSending(true);
    setError(null);
    setPending(text);
    setDraft('');
    try {
      const turn = await useLearningStore.getState().sendDiscussionMessage(activity.id, text);
      setLatest(turn.activity);
      setPending(null);
      if (turn.done && turn.skill && turn.profile) onComplete(turn as SubmitResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your message');
      setPending(null);
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  const endSession = async () => {
    setConfirmOpen(false);
    setEnding(true);
    setError(null);
    try {
      const result = await useLearningStore.getState().submitActivity(activity.id, {});
      onComplete(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not end the session');
      setEnding(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="mx-auto flex flex-col" style={{ maxWidth: 760, width: '100%', gap: 'var(--space-3)' }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ gap: 'var(--space-3)' }}>
        <div className="flex items-baseline flex-wrap" style={{ gap: 'var(--space-2)' }}>
          <div className="card-kicker">Talk it through</div>
          <div style={{ fontSize: 13, opacity: 0.5 }}>{turnLabel}</div>
        </div>
        {!closed && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: 13 }}
            onClick={() => setConfirmOpen(true)}
            disabled={busy}
          >
            {ending ? 'Ending…' : 'End session'}
          </button>
        )}
      </div>

      {/* Transcript */}
      <div
        ref={panelRef}
        className="card flex flex-col"
        style={{
          gap: 'var(--space-3)',
          padding: 'var(--space-3)',
          minHeight: 260,
          maxHeight: '58vh',
          overflowY: 'auto',
        }}
        aria-live="polite"
      >
        {messages.length === 0 && !pending && (
          <div className="text-center" style={{ fontSize: 13, opacity: 0.45, padding: 'var(--space-6) 0' }}>
            Say hello to get the discussion going.
          </div>
        )}
        {messages.map((m, i) => (
          <Bubble key={`${m.at}-${i}`} message={m} />
        ))}
        {pending && <Bubble message={{ role: 'user', content: pending, at: '' }} />}
        {sending && (
          <div className="flex items-center" style={{ gap: 'var(--space-2)', fontSize: 13, opacity: 0.55 }}>
            <Spinner size="sm" />
            Tutor is thinking…
          </div>
        )}
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

      {closed ? (
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
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Answer the tutor in your own words… (Enter to send, Shift+Enter for a new line)"
            minHeight={44}
            maxHeight={200}
            disabled={busy}
            aria-label="Your reply"
            style={{ fontSize: 14, lineHeight: 1.5 }}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void send()}
            disabled={busy || !draft.trim()}
            style={{ minHeight: 44 }}
            aria-label="Send"
          >
            <HiOutlinePaperAirplane size={16} />
            <span>Send</span>
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="End this session?"
        message="The tutor will grade what you've shown so far. You can't reopen the discussion afterwards."
        confirmLabel="End session"
        cancelLabel="Keep going"
        onConfirm={() => void endSession()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
