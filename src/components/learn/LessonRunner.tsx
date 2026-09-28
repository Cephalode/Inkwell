import { useState } from 'react';
import { HiCheck, HiOutlineClock, HiSpeakerWave } from 'react-icons/hi2';
import Markdown from '../shared/Markdown';
import { speakAll, stopSpeak } from '../shared/SelectionTTS';
import { useLearningStore } from '../../store/learningStore';
import { buildSpeakable, chunkSpeechText } from '../../utils/speechText';
import type { LessonContent } from '../../types/learning';
import type { ActivityRunnerProps } from './runnerProps';

/**
 * Lesson runner — a short explainer followed by "check yourself"
 * checkpoints the learner reveals and self-grades. Finishing submits the
 * number of checkpoints they got right.
 */
export default function LessonRunner({ activity, onComplete, onAbandon }: ActivityRunnerProps) {
  const submitActivity = useLearningStore((s) => s.submitActivity);
  const content = activity.content as LessonContent | null;

  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [grades, setGrades] = useState<Record<number, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const readAloud = async () => {
    if (reading) {
      stopSpeak(); // audio 'pause' flips the bar off; just sync our button
      setReading(false);
      return;
    }
    setError(null);
    setReading(true);
    try {
      // Parse the markdown SOURCE: formatting markers, code blocks and the
      // like are skipped, math is converted to speakable words.
      await speakAll(chunkSpeechText(buildSpeakable(content?.markdown ?? '')), true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the lesson aloud');
    } finally {
      setReading(false);
    }
  };

  if (!content || !content.markdown) {
    return (
      <div className="card flex flex-col items-start gap-3 p-5">
        <p className="text-sm" style={{ opacity: 0.7 }}>
          This lesson has no content — it may have failed to generate.
        </p>
        <button type="button" className="btn btn-secondary" onClick={onAbandon}>
          Back to strategies
        </button>
      </div>
    );
  }

  const checkpoints = content.checkpoints ?? [];
  const total = checkpoints.length;
  const gradedCount = checkpoints.filter((_, i) => grades[i] !== undefined).length;
  const allGraded = gradedCount === total;
  const correct = Object.values(grades).filter(Boolean).length;

  const setGrade = (i: number, ok: boolean) => setGrades((g) => ({ ...g, [i]: ok }));

  const finish = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitActivity(activity.id, { checkpointsCorrect: correct });
      onComplete(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not finish the lesson');
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Reading */}
      <article className="card" style={{ padding: 'var(--space-6)' }}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs" style={{ opacity: 0.55 }}>
            <HiOutlineClock className="h-3.5 w-3.5" />≈ {content.estimatedMinutes} min read
          </div>
          <button
            type="button"
            className="btn btn-secondary shrink-0"
            style={{ fontSize: 13 }}
            onClick={() => void readAloud()}
            title="Read the whole lesson aloud"
          >
            <HiSpeakerWave className="h-4 w-4" />
            {reading ? 'Stop reading' : 'Listen'}
          </button>
        </div>
        <Markdown content={content.markdown} className="text-[15px]" />
      </article>

      {/* Checkpoints */}
      {total > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="section-label" style={{ margin: 0 }}>
              Check yourself
            </h3>
            <span className="text-xs" style={{ opacity: 0.55 }}>
              Answer in your head, reveal, then grade yourself honestly
            </span>
          </div>
          {checkpoints.map((cp, i) => {
            const shown = !!revealed[i];
            const grade = grades[i];
            const edge =
              grade === undefined ? undefined : `3px solid ${grade ? 'var(--color-success)' : 'var(--color-warning)'}`;
            return (
              <div key={i} className="card space-y-3 p-4" style={{ borderLeft: edge }}>
                <div className="card-kicker">
                  Checkpoint {i + 1} of {total}
                </div>
                <p className="text-sm font-semibold">{cp.question}</p>
                {!shown ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setRevealed((r) => ({ ...r, [i]: true }))}
                  >
                    Reveal answer
                  </button>
                ) : (
                  <>
                    <div
                      style={{
                        padding: '10px 12px',
                        background: 'var(--color-neutral-100)',
                        border: '1px solid var(--color-divider)',
                        borderRadius: 'var(--radius-md)',
                      }}
                    >
                      <Markdown content={cp.answer} compact />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        aria-pressed={grade === true}
                        onClick={() => setGrade(i, true)}
                        style={
                          grade === true
                            ? {
                                borderColor: 'var(--color-success)',
                                color: 'var(--color-success)',
                                background: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
                              }
                            : undefined
                        }
                      >
                        <HiCheck className="h-4 w-4" />I got it
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        aria-pressed={grade === false}
                        onClick={() => setGrade(i, false)}
                        style={
                          grade === false
                            ? {
                                borderColor: 'var(--color-warning)',
                                color: 'var(--color-warning)',
                                background: 'color-mix(in srgb, var(--color-warning) 12%, transparent)',
                              }
                            : undefined
                        }
                      >
                        Not yet
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </section>
      )}

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

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs" style={{ opacity: 0.55 }}>
          {total === 0
            ? 'No checkpoints for this lesson — finish when you have read it'
            : `${gradedCount}/${total} checkpoints graded`}
        </span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!allGraded || submitting}
          onClick={finish}
          title={allGraded ? undefined : 'Grade every checkpoint first'}
        >
          {submitting ? 'Finishing…' : 'Finish lesson'}
        </button>
      </div>
    </div>
  );
}
