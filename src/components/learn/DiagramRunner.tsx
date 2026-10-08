import { useCallback, useEffect, useRef, useState } from 'react';
import { Excalidraw, exportToBlob, CaptureUpdateAction } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import { HiOutlineLightBulb } from 'react-icons/hi2';
import Markdown from '../shared/Markdown';
import Spinner from '../shared/Spinner';
import { useResolvedTheme } from '../../hooks/useTheme';
import { useLearningStore } from '../../store/learningStore';
import { submitDiagramReview } from '../../services/api/learning';
import type { DiagramContent, DiagramResult } from '../../types/learning';
import type { ActivityRunnerProps } from './runnerProps';

/** PNG size cap for the vision upload (~1.5 MB base64 is plenty for a sketch). */
const MAX_IMAGE_CHARS = 2_000_000;

const NO_STRINGS: string[] = [];

/**
 * "Draw a diagram": sketch the concept on an Excalidraw canvas, submit for a
 * vision review; the tutor asks for additions until the rubric is covered or
 * rounds run out, then grades the final drawing.
 */
export default function DiagramRunner({ activity, onComplete }: ActivityRunnerProps) {
  const content = activity.content as DiagramContent | null;
  const prompt = content?.prompt ?? '';
  const hints = content?.hints ?? NO_STRINGS;

  const excalidrawRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const resolvedTheme = useResolvedTheme();
  // Excalidraw reads initialData only on mount (before the theme resolves),
  // so the canvas background is applied imperatively instead.
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  useEffect(() => {
    if (!excalidrawAPI || !resolvedTheme) return;
    excalidrawAPI.updateScene({
      appState: { viewBackgroundColor: resolvedTheme === 'dark' ? '#121212' : '#ffffff' },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, [excalidrawAPI, resolvedTheme]);
  const [round, setRound] = useState((content?.messages.filter((m) => m.role === 'user').length ?? 0) + 1);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [hintsShown, setHintsShown] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Scroll the drawing into view whenever a review round starts.
  useEffect(() => {
    if (reviewing) excalidrawRef.current?.scrollToContent(undefined, { fitToViewport: true });
  }, [reviewing]);

  /** Export the canvas to a compact PNG data URL, or null when it's empty. */
  const snapshot = useCallback(async (): Promise<string | null> => {
    const api = excalidrawRef.current;
    if (!api) return null;
    const elements = api.getSceneElements().filter((el) => !el.isDeleted);
    if (elements.length === 0) return null;
    let blob = await exportToBlob({
      elements,
      appState: { exportBackground: true, viewBackgroundColor: '#ffffff' },
      files: null,
      mimeType: 'image/png',
      getDimensions: (w: number, h: number) => ({ width: w * 2, height: h * 2, scale: 2 }),
    });
    // ponytail: fixed 0.7 quality JPEG re-encode if the PNG is huge — plenty for a vision sketch.
    if (blob.size > MAX_IMAGE_CHARS) {
      blob = await exportToBlob({
        elements,
        appState: { exportBackground: true, viewBackgroundColor: '#ffffff' },
        files: null,
        mimeType: 'image/jpeg',
        quality: 0.7,
      });
    }
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  }, []);

  const submit = async () => {
    if (reviewing) return;
    setError(null);
    setReviewing(true);
    try {
      const image = await snapshot();
      if (!image) {
        setError('Draw something first — the canvas is empty.');
        setReviewing(false);
        return;
      }
      const turn = await submitDiagramReview(activity.id, image);
      if (turn.done) {
        // The server completed the activity; fold it into the store and show the outcome.
        const step = useLearningStore.getState().stepsById[activity.stepId];
        const refreshed = await useLearningStore.getState().loadStep(activity.stepId, true);
        void step;
        const completed = refreshed.activities.find((a) => a.id === activity.id);
        const skill = turn.skill ?? refreshed.skill;
        onComplete({
          activity: completed ?? turn.activity,
          skill,
          previousMastery: turn.previousMastery ?? skill.mastery,
          justLearned: turn.justLearned ?? false,
          xpGained: turn.xpGained ?? 0,
          profile: turn.profile ?? (await useLearningStore.getState().loadOverview()).profile,
        });
        return;
      }
      setFeedback(turn.review.feedback);
      setRound((r) => r + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not review your diagram');
    } finally {
      setReviewing(false);
    }
  };

  return (
    <div className="mx-auto flex flex-col" style={{ maxWidth: 960, width: '100%', gap: 'var(--space-4)' }}>
      {/* Prompt */}
      <div className="card" style={{ padding: 'var(--space-4) var(--space-5)' }}>
        <div className="card-kicker">Draw a diagram · review {Math.min(round, content?.maxRounds ?? 3)} of {content?.maxRounds ?? 3}</div>
        <div style={{ marginTop: 'var(--space-2)', fontSize: 15 }}>
          <Markdown content={prompt} className="[&_p]:text-[15px] [&_li]:text-[15px]" />
        </div>
        <div style={{ marginTop: 'var(--space-3)', fontSize: 13, opacity: 0.55 }}>
          Sketch it with shapes, labels and arrows — don't worry about neatness. Submit and the tutor will look at your
          drawing and tell you what to add.
        </div>
      </div>

      {/* Tutor feedback from the last round */}
      {feedback && (
        <div
          className="flex"
          style={{
            gap: 'var(--space-2)',
            padding: '10px 14px',
            fontSize: 14,
            borderLeft: '2px solid var(--color-accent)',
            background: 'color-mix(in srgb, var(--color-accent) 7%, transparent)',
            borderRadius: '0 var(--radius-md) var(--radius-md) 0',
          }}
        >
          <Markdown content={feedback} compact className="[&_p]:text-sm" />
        </div>
      )}

      {/* Hints */}
      {hints.length > 0 && (
        <div className="flex items-center justify-between" style={{ gap: 'var(--space-3)' }}>
          {hintsShown < hints.length ? (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 13 }}
              onClick={() => setHintsShown((n) => Math.min(n + 1, hints.length))}
              disabled={reviewing}
            >
              <HiOutlineLightBulb size={15} />
              Show a hint ({hintsShown + 1} of {hints.length})
            </button>
          ) : (
            <div style={{ fontSize: 12.5, opacity: 0.45 }}>All hints shown</div>
          )}
        </div>
      )}
      {hintsShown > 0 && (
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

      {/* Canvas */}
      <div
        className="card overflow-hidden"
        style={{ height: 480, padding: 0 }}
        role="application"
        aria-label="Diagram canvas"
      >
        <Excalidraw
          excalidrawAPI={(api) => {
            excalidrawRef.current = api;
            setExcalidrawAPI(api);
          }}
          theme={resolvedTheme ?? undefined}
          UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false } }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between" style={{ gap: 'var(--space-3)' }}>
        <div style={{ fontSize: 13, opacity: 0.55 }}>
          {reviewing ? 'The tutor is looking at your drawing…' : 'Happy with it? Submit for review — you can keep drawing after.'}
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={reviewing}>
          {reviewing ? (
            <>
              <Spinner size="sm" />
              &nbsp;Reviewing your diagram…
            </>
          ) : round > (content?.maxRounds ?? 3) ? (
            'Submit for final grade'
          ) : (
            'Submit for review'
          )}
        </button>
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

export type { DiagramResult };
