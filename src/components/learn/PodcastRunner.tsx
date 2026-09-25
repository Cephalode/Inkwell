import { useEffect, useState } from 'react';
import { HiCheck, HiSpeakerWave } from 'react-icons/hi2';
import Spinner from '../shared/Spinner';
import { getActivity } from '../../services/api/learning';
import { useLearningStore } from '../../store/learningStore';
import type { PodcastContent } from '../../types/learning';
import type { ActivityRunnerProps } from './runnerProps';

/**
 * Podcast runner — a two-host audio overview of the step, plus the full
 * transcript. The MP3 is rendered by the server after the activity starts
 * (fire-and-forget, 1-4 min), so while `audioPath` is missing we poll the
 * activity; the readable transcript is shown immediately. "Done" just
 * submits — listening earns XP like reading a lesson, no grading.
 */
export default function PodcastRunner({ activity, onComplete, onAbandon }: ActivityRunnerProps) {
  const submitActivity = useLearningStore((s) => s.submitActivity);
  const content = activity.content as PodcastContent | null;

  const [current, setCurrent] = useState(activity);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll while the TTS render is in flight (bounded ~5 min at 5s intervals).
  const [polls, setPolls] = useState(0);
  useEffect(() => {
    if (current.content && (current.content as PodcastContent).audioPath) return;
    if (current.content && (current.content as PodcastContent).renderError) return;
    if (polls >= 60) return;
    const t = setTimeout(() => {
      getActivity(activity.id)
        .then(setCurrent)
        .catch(() => {/* transient — next tick retries */})
        .finally(() => setPolls((n) => n + 1));
    }, 5000);
    return () => clearTimeout(t);
  }, [current, polls, activity.id, getActivity]);

  if (!content || !content.lines?.length) {
    return (
      <div className="card flex flex-col items-start gap-3 p-5">
        <p className="text-sm" style={{ opacity: 0.7 }}>
          This podcast has no script — it may have failed to generate.
        </p>
        <button type="button" className="btn btn-secondary" onClick={onAbandon}>
          Back to strategies
        </button>
      </div>
    );
  }

  const audioPath = content.audioPath;
  const renderError = content.renderError;
  const rendering = !audioPath && !renderError && polls < 60;
  const gaveUp = !audioPath && !renderError && polls >= 60;

  const finish = async () => {
    setSubmitting(true);
    setError(null);
    try {
      onComplete(await submitActivity(activity.id, {}));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete the podcast');
      setSubmitting(false);
    }
  };

  return (
    <div className="card space-y-4 p-5">
      <div className="flex items-center gap-3">
        <span style={{ fontSize: 28, lineHeight: 1 }} aria-hidden>
          🎙️
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{content.title}</div>
          <div className="text-xs" style={{ opacity: 0.6 }}>
            Audio overview · {content.lines.length} exchanges
          </div>
        </div>
      </div>

      {audioPath ? (
        <audio controls className="w-full" src={`/api/learning-activities/${activity.id}/audio`} preload="none" />
      ) : rendering ? (
        <div className="flex items-center gap-2 text-sm" style={{ opacity: 0.7 }}>
          <Spinner size="sm" />
          Rendering audio… the transcript below is ready meanwhile.
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs" style={{ opacity: 0.6 }}>
          <HiSpeakerWave className="h-4 w-4 shrink-0" aria-hidden />
          {renderError ? `Audio render failed (${renderError}) — the transcript is still useful.` : 'Audio is taking longer than expected — the transcript is below.'}
        </div>
      )}

      <div className="space-y-2">
        {content.lines.map((line, i) => (
          <div key={i} className={line.speaker === 'host' ? '' : 'pl-5'}>
            <span className="text-xs font-semibold" style={{ color: line.speaker === 'host' ? 'var(--color-accent)' : 'var(--color-pink, var(--color-accent))' }}>
              {line.speaker === 'host' ? 'Host' : 'Guest'}
            </span>
            <p className="text-sm leading-snug">{line.text}</p>
          </div>
        ))}
      </div>

      {error && (
        <p className="text-sm" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-primary" onClick={() => void finish()} disabled={submitting}>
          {submitting ? <Spinner size="sm" /> : <HiCheck className="h-4 w-4" aria-hidden />}
          Done listening
        </button>
        <button type="button" className="btn btn-ghost" onClick={onAbandon}>
          Back to strategies
        </button>
      </div>
    </div>
  );
}
