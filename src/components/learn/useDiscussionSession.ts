import { useState } from 'react';
import { useLearningStore } from '../../store/learningStore';
import type { DiscussionContent, LearningActivity } from '../../types/learning';

const EMPTY_CONTENT: DiscussionContent = { messages: [], closed: false, maxTurns: 0 };

function contentOf(activity: LearningActivity | null): DiscussionContent | null {
  const c = activity?.content as DiscussionContent | null | undefined;
  return c && Array.isArray(c.messages) ? c : null;
}

/**
 * All the mechanics of a "Talk it through" session, shared by the stacked
 * runner and the two-pane workspace: freshest-transcript reconciliation,
 * send/turn handling, session ending, auto-scroll and the turn label.
 * The transcript lives in `activity.content`; every turn the server returns
 * the updated activity plus an assessment, and once the tutor is convinced
 * (or turns run out) the turn response is also the `SubmitResponse` that
 * closes the activity.
 */
export function useDiscussionSession(activity: LearningActivity) {
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
      return turn;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your message');
      setPending(null);
      setDraft(text);
      return null;
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
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not end the session');
      setEnding(false);
      return null;
    }
  };

  return {
    messages,
    maxTurns,
    closed,
    userTurns,
    turnLabel,
    draft,
    setDraft,
    pending,
    sending,
    ending,
    busy,
    error,
    setError,
    confirmOpen,
    setConfirmOpen,
    send,
    endSession,
  };
}
