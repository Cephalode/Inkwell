import { useState, useCallback, useRef, useEffect } from 'react';
import { analyzeChapter as startAnalysisStream, getChapterAnalysis } from '../services/api/client';
import { consumeSSE } from '../utils/sse';
import type { AnalysisStatus, SubsectionAnalysis, DetectedSubsection } from '../types/analysis';

/**
 * Shape of a raw SSE event coming from the backend analysis pipeline.
 * Only the fields actually consumed are typed; the rest are ignored.
 */
interface AnalysisEvent {
  type: string;
  message?: string;
  count?: number;
  index?: number;
  total?: number;
  title?: string;
  pages?: [number, number];
  subsections?: Array<{ title: string; pages: [number, number] }>;
  summary?: string;
  keyPoints?: string[];
  formulas?: string[];
  definitions?: string[];
  notes?: string;
  totalSubsections?: number;
}

export interface UseChapterAnalysis {
  status: AnalysisStatus;
  subsections: DetectedSubsection[];
  results: SubsectionAnalysis[];
  currentSubsection: number;
  totalSubsections: number;
  chapterNotes: string;
  error: string | null;
  /** Begin (or restart) analysis for a saved chapter. */
  analyzeChapter: (chapterId: string) => Promise<void>;
  /** Reset all state back to idle. */
  reset: () => void;
}

/**
 * Manages the full chapter-analysis lifecycle: cache lookup → SSE stream →
 * parsed progress/results state. Cancels any in-flight stream when the
 * component unmounts or a new analysis is started.
 */
export function useChapterAnalysis(): UseChapterAnalysis {
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [subsections, setSubsections] = useState<DetectedSubsection[]>([]);
  const [results, setResults] = useState<SubsectionAnalysis[]>([]);
  const [currentSubsection, setCurrentSubsection] = useState(-1);
  const [totalSubsections, setTotalSubsections] = useState(0);
  const [chapterNotes, setChapterNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  /** Tracks the in-flight fetch so it can be aborted on unmount / re-run. */
  const abortRef = useRef<AbortController | null>(null);

  /** Mirror of `subsections` so the SSE loop can read the latest value. */
  const subsectionsRef = useRef<DetectedSubsection[]>([]);
  useEffect(() => {
    subsectionsRef.current = subsections;
  }, [subsections]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setStatus('idle');
    setSubsections([]);
    subsectionsRef.current = [];
    setResults([]);
    setCurrentSubsection(-1);
    setTotalSubsections(0);
    setChapterNotes('');
    setError(null);
  }, []);

  const analyzeChapter = useCallback(async (chapterId: string) => {
    // Abort any previous in-flight analysis before starting a new one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Reset state for the new run.
    setStatus('loading-cache');
    setSubsections([]);
    subsectionsRef.current = [];
    setResults([]);
    setCurrentSubsection(-1);
    setTotalSubsections(0);
    setChapterNotes('');
    setError(null);

    try {
      // 1. Check cache first — return immediately if already analyzed.
      const cached = await getChapterAnalysis(chapterId);
      if (controller.signal.aborted) return;

      if (cached) {
        const detected = cached.subsections.map((s) => ({
          title: s.title,
          startPage: s.startPage,
          endPage: s.endPage,
        }));
        subsectionsRef.current = detected;
        setSubsections(detected);
        setResults(cached.subsections);
        setTotalSubsections(cached.subsections.length);
        setChapterNotes(cached.chapterNotes);
        setStatus('done');
        return;
      }

      // 2. No cache — start the SSE analysis stream.
      const response = await startAnalysisStream(chapterId, controller.signal);
      if (controller.signal.aborted) return;

      if (!response.ok || !response.body) {
        throw new Error(`Analysis request failed: ${response.status}`);
      }

      // Read the stream via the shared SSE parser.
      await consumeSSE<AnalysisEvent>(response, (evt) => {
        // --- Dispatch event → state update ---
        switch (evt.type) {
          case 'extracting':
            setStatus('extracting');
            break;
          case 'detecting_subsections':
            setStatus('detecting');
            break;
          case 'subsections_detected': {
            const detected: DetectedSubsection[] = (evt.subsections ?? []).map((s) => ({
              title: s.title,
              startPage: s.pages[0],
              endPage: s.pages[1],
            }));
            subsectionsRef.current = detected;
            setSubsections(detected);
            setTotalSubsections(evt.count ?? detected.length);
            setStatus('analyzing');
            break;
          }
          case 'subsection_start':
            setCurrentSubsection(evt.index ?? 0);
            break;
          case 'subsection_result': {
            const idx = evt.index ?? 0;
            const meta = subsectionsRef.current[idx];
            const result: SubsectionAnalysis = {
              title: evt.title ?? meta?.title ?? '',
              startPage: meta?.startPage ?? 0,
              endPage: meta?.endPage ?? 0,
              summary: evt.summary ?? '',
              keyPoints: evt.keyPoints ?? [],
              formulas: evt.formulas ?? [],
              definitions: evt.definitions ?? [],
            };
            // Place by index so ordering is always correct even if events
            // arrive out of order.
            setResults((prev) => {
              const next = [...prev];
              next[idx] = result;
              return next;
            });
            break;
          }
          case 'synthesizing':
            setStatus('synthesizing');
            break;
          case 'chapter_synthesis':
            setChapterNotes(evt.notes ?? '');
            break;
          case 'done':
            setStatus('done');
            setTotalSubsections(evt.totalSubsections ?? subsectionsRef.current.length);
            break;
          case 'error':
            setStatus('error');
            setError(evt.message ?? 'Analysis failed');
            break;
          default:
            break;
        }
      }, controller.signal);
    } catch (err) {
      // Aborts are not errors — just stop quietly.
      if (controller.signal.aborted) return;
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Analysis failed');
    }
  }, []);

  // Abort any in-flight stream when the component unmounts.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return {
    status,
    subsections,
    results,
    currentSubsection,
    totalSubsections,
    chapterNotes,
    error,
    analyzeChapter,
    reset,
  };
}
