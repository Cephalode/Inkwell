import { useCallback, useRef, useEffect } from 'react';
import { generateStudyGuide } from '../services/api/client';
import { useStudyGuideStore, type GenerationProgress } from '../store/studyGuideStore';
import type { StudyGuideContent } from '../types/studyGuide';

/**
 * Shape of a raw SSE event coming from the study guide generation pipeline.
 */
interface GuideGenEvent {
  type: string;
  message?: string;
  count?: number;
  index?: number;
  total?: number;
  title?: string;
  /** Nested title, emitted by the shared generation pipeline's `material_start`. */
  material?: { id?: string; title?: string };
  summary?: string;
  keyPoints?: string[];
  formulas?: string[];
  definitions?: string[];
  guide?: StudyGuideContent;
}

const DEFAULT_PROGRESS: GenerationProgress = {
  status: 'idle',
  current: 0,
  total: 0,
  currentTitle: '',
  message: '',
  error: null,
};

export interface UseStudyGuideGeneration {
  /** Live generation progress for the guide (if any). */
  progress: GenerationProgress | undefined;
  /** True when a generation stream is actively running. */
  isGenerating: boolean;
  /** Start (or restart) generation for a study guide via SSE. */
  generate: (guideId: string) => Promise<void>;
  /** Reset progress for a guide. */
  reset: (guideId: string) => void;
}

/**
 * Manages the study-guide generation SSE lifecycle. Mirrors progress into the
 * Zustand store (keyed by guideId) so other components — e.g. the list page or
 * chat — can observe runs they didn't start.
 *
 * Cancels any in-flight stream when the component unmounts or a new generation
 * is started.
 */
export function useStudyGuideGeneration(guideId?: string): UseStudyGuideGeneration {
  const progress = useStudyGuideStore((s) => (guideId ? s.generationProgress[guideId] : undefined));
  const setProgress = useStudyGuideStore((s) => s.setGenerationProgress);
  const clearProgress = useStudyGuideStore((s) => s.clearGenerationProgress);
  const updateGuide = useStudyGuideStore((s) => s.updateGuide);

  const abortRef = useRef<AbortController | null>(null);

  /** Mirror of total so the SSE loop can read the latest value. */
  const totalRef = useRef(0);

  const isGenerating =
    progress?.status === 'collecting' ||
    progress?.status === 'analyzing' ||
    progress?.status === 'synthesizing';

  const reset = useCallback(
    (_guideId: string) => {
      abortRef.current?.abort();
      clearProgress(_guideId);
    },
    [clearProgress],
  );

  const generate = useCallback(
    async (id: string) => {
      // Abort any previous in-flight generation before starting a new one.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      totalRef.current = 0;

      setProgress(id, {
        ...DEFAULT_PROGRESS,
        status: 'collecting',
        message: 'Starting generation…',
      });

      try {
        const response = await generateStudyGuide(id, controller.signal);
        if (controller.signal.aborted) return;

        if (!response.ok || !response.body) {
          throw new Error(`Generation request failed: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // Read the stream, splitting on the SSE record delimiter `\n\n`.
        while (true) {
          if (controller.signal.aborted) {
            reader.cancel().catch(() => {});
            return;
          }
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          let sep: number;
          while ((sep = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);

            // Find the `data: ` line within the event.
            const dataLine = rawEvent
              .split('\n')
              .map((l) => l.trim())
              .find((l) => l.startsWith('data: '));
            if (!dataLine) continue;

            const payload = dataLine.slice(6);
            let evt: GuideGenEvent;
            try {
              evt = JSON.parse(payload) as GuideGenEvent;
            } catch {
              continue; // skip malformed events
            }

            // --- Dispatch event → state update ---
            switch (evt.type) {
              case 'status':
                setProgress(id, (prev) => ({
                  ...(prev ?? DEFAULT_PROGRESS),
                  status: 'collecting',
                  message: evt.message ?? '',
                }));
                break;

              case 'materials_collected':
                totalRef.current = evt.count ?? 0;
                setProgress(id, (prev) => ({
                  ...(prev ?? DEFAULT_PROGRESS),
                  status: 'analyzing',
                  total: evt.count ?? 0,
                  current: 0,
                  message: `Analyzing ${evt.count ?? 0} materials…`,
                }));
                break;

              case 'material_start':
                // The shared pipeline nests the title under `material.title`;
                // fall back to the legacy top-level `title` for older streams.
                const materialTitle = evt.material?.title ?? evt.title ?? '';
                setProgress(id, (prev) => ({
                  ...(prev ?? DEFAULT_PROGRESS),
                  status: 'analyzing',
                  current: (evt.index ?? 0) + 1,
                  total: totalRef.current,
                  currentTitle: materialTitle,
                  message: `Analyzing: ${materialTitle}`,
                }));
                break;

              case 'material_result':
                // Progress already advanced in material_start; nothing extra to store.
                break;

              case 'synthesizing':
                setProgress(id, (prev) => ({
                  ...(prev ?? DEFAULT_PROGRESS),
                  status: 'synthesizing',
                  current: totalRef.current,
                  total: totalRef.current,
                  message: evt.message ?? 'Synthesizing study guide…',
                }));
                break;

              case 'guide':
                if (evt.guide) {
                  updateGuide(id, { content: evt.guide, status: 'done', error: null });
                }
                setProgress(id, (prev) => ({
                  ...(prev ?? DEFAULT_PROGRESS),
                  status: 'done',
                  message: 'Study guide generated successfully.',
                }));
                break;

              case 'done':
                setProgress(id, (prev) => ({
                  ...(prev ?? DEFAULT_PROGRESS),
                  status: 'done',
                  message: 'Study guide generated successfully.',
                }));
                break;

              case 'error':
                setProgress(id, (prev) => ({
                  ...(prev ?? DEFAULT_PROGRESS),
                  status: 'error',
                  error: evt.message ?? 'Generation failed',
                  message: evt.message ?? 'Generation failed',
                }));
                updateGuide(id, { status: 'error', error: evt.message ?? 'Generation failed' });
                break;

              default:
                break;
            }
          }
        }
      } catch (err) {
        // Aborts are not errors — just stop quietly.
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : 'Generation failed';
        setProgress(id, (prev) => ({
          ...(prev ?? DEFAULT_PROGRESS),
          status: 'error',
          error: msg,
          message: msg,
        }));
      }
    },
    [setProgress, updateGuide],
  );

  // Abort any in-flight stream when the component unmounts.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { progress, isGenerating, generate, reset };
}
