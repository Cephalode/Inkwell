import { useState, useRef, useEffect, useCallback } from 'react';
import {
  HiSparkles,
  HiLightBulb,
  HiCalculator,
  HiBookOpen,
  HiExclamation,
  HiRefresh,
  HiVolumeUp,
} from 'react-icons/hi';
import Spinner from '../shared/Spinner';
import Badge from '../shared/Badge';
import Markdown from '../shared/Markdown';
import { fetchVideoSummary } from '../../services/api/client';
import { consumeSSE } from '../../utils/sse';
import { useTTSStore } from '../../store/ttsStore';
import type { VideoSummary } from '../../types/document';

/**
 * Shape of a raw SSE event from the video-summary endpoint.
 */
interface VideoSummaryEvent {
  type: string;
  message?: string;
  summary?: string;
  keyPoints?: string[];
  formulas?: string[];
  definitions?: string[];
  topics?: string[];
}

interface VideoSummaryPanelProps {
  docId: string;
  existingSummary?: VideoSummary | null;
}

type Status = 'idle' | 'analyzing' | 'done' | 'error';

/**
 * Panel for viewing / generating an AI summary of a video transcript.
 *
 * - If `existingSummary` is provided, it is displayed immediately.
 * - Otherwise a "Generate Summary" button triggers the SSE endpoint
 *   `/documents/:id/video-summary` and streams the result live.
 */
export default function VideoSummaryPanel({ docId, existingSummary }: VideoSummaryPanelProps) {
  const [status, setStatus] = useState<Status>(existingSummary ? 'done' : 'idle');
  const [summary, setSummary] = useState<VideoSummary | null>(existingSummary ?? null);
  const [error, setError] = useState<string | null>(null);
  const [analyzingMessage, setAnalyzingMessage] = useState('Analyzing transcript…');
  const abortRef = useRef<AbortController | null>(null);
  // Track the last-seen existingSummary so we can sync state during render
  // instead of inside an effect (avoids cascading renders).
  const [prevExistingSummary, setPrevExistingSummary] = useState(existingSummary);

  // ── Global TTS store ─────────────────────────────────────────────────
  const ttsIsSpeaking = useTTSStore((s) => s.isSpeaking);
  const ttsIsSequential = useTTSStore((s) => s.isSequential);
  const ttsCurrentTitle = useTTSStore((s) => s.currentTitle);
  const ttsSpeak = useTTSStore((s) => s.speak);
  const ttsStop = useTTSStore((s) => s.stop);

  // Highlight while this summary is the one being read aloud.
  const reading =
    ttsIsSpeaking && !ttsIsSequential && ttsCurrentTitle === 'Video Summary';

  /** Compose the spoken version of the summary: summary + key points. */
  const buildSummarySpeech = useCallback((s: VideoSummary): string => {
    const parts: string[] = [];
    if (s.summary) parts.push(s.summary);
    if (s.keyPoints.length > 0) parts.push('Key points. ' + s.keyPoints.join('. '));
    return parts.filter(Boolean).join('. ');
  }, []);

  const toggleListen = useCallback(() => {
    if (!summary) return;
    if (reading && ttsIsSpeaking) {
      ttsStop();
      return;
    }
    const text = buildSummarySpeech(summary);
    if (!text.trim()) return;
    ttsSpeak(text, 'Video Summary');
  }, [summary, reading, ttsIsSpeaking, ttsStop, ttsSpeak, buildSummarySpeech]);

  // Keep in sync if the parent passes a freshly-loaded summary (e.g. after
  // polling completes in the hook). Adjust state during render to avoid
  // calling setState inside an effect.
  if (existingSummary !== prevExistingSummary) {
    setPrevExistingSummary(existingSummary);
    if (existingSummary) {
      setSummary(existingSummary);
      setStatus('done');
    }
  }

  // Abort any in-flight stream on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const generate = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('analyzing');
    setSummary(null);
    setError(null);
    setAnalyzingMessage('Analyzing transcript…');

    try {
      const response = await fetchVideoSummary(docId);
      if (controller.signal.aborted) return;

      if (!response.ok || !response.body) {
        throw new Error(`Request failed: ${response.status}`);
      }

      // Read the stream via the shared SSE parser.
      await consumeSSE<VideoSummaryEvent>(response, (evt) => {
        switch (evt.type) {
          case 'analyzing':
            setAnalyzingMessage(evt.message ?? 'Analyzing transcript…');
            break;
          case 'result': {
            const result: VideoSummary = {
              summary: evt.summary ?? '',
              keyPoints: evt.keyPoints ?? [],
              formulas: evt.formulas ?? [],
              definitions: evt.definitions ?? [],
              topics: evt.topics ?? [],
            };
            setSummary(result);
            setStatus('done');
            break;
          }
          case 'done':
            setStatus('done');
            break;
          case 'error':
            setStatus('error');
            setError(evt.message ?? 'Summary generation failed');
            break;
          default:
            break;
        }
      }, controller.signal);
    } catch (err) {
      if (controller.signal.aborted) return;
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Summary generation failed');
    }
  }, [docId]);

  // ── Idle / empty state ────────────────────────────────────────────────
  if (status === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <div
          className="w-12 h-12 flex items-center justify-center rounded-full"
          style={{ background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }}
        >
          <HiSparkles className="w-6 h-6" style={{ color: 'var(--color-accent)' }} />
        </div>
        <p className="text-sm max-w-sm" style={{ opacity: 0.75 }}>
          Generate an AI-powered summary of this video's transcript — key points, formulas, definitions, and topics.
        </p>
        <button onClick={generate} className="btn btn-primary">
          <HiSparkles className="w-4 h-4" />
          Generate Summary
        </button>
      </div>
    );
  }

  // ── Analyzing state ───────────────────────────────────────────────────
  if (status === 'analyzing' && !summary) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10">
        <Spinner size="md" />
        <span className="text-sm" style={{ opacity: 0.75 }}>{analyzingMessage}</span>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────
  if (status === 'error' && !summary) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
        <HiExclamation className="w-8 h-8" style={{ color: 'var(--color-danger)' }} />
        <p className="text-sm max-w-sm" style={{ color: 'var(--color-danger)' }}>
          {error || 'Something went wrong while generating the summary.'}
        </p>
        <button onClick={generate} className="btn btn-primary">
          <HiRefresh className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────────────────
  if (!summary) return null;

  return (
    <div className="space-y-4">
      {/* Listen button — transport controls live in the global bottom overlay */}
      <div>
        <button
          onClick={toggleListen}
          className={`btn ${reading && ttsIsSpeaking ? 'btn-secondary' : 'btn-primary'}`}
          style={
            reading && ttsIsSpeaking
              ? {
                  background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                  color: 'var(--color-accent-700)',
                  borderColor: 'color-mix(in srgb, var(--color-accent) 35%, transparent)',
                }
              : undefined
          }
        >
          <HiVolumeUp className={`w-4 h-4 ${reading && ttsIsSpeaking ? 'animate-pulse' : ''}`} />
          {reading && ttsIsSpeaking ? 'Stop Listening' : 'Listen'}
        </button>
      </div>

      {/* Topics — badges at the top */}
      {summary.topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {summary.topics.map((topic, i) => (
            <Badge key={i} color="teal">{topic}</Badge>
          ))}
        </div>
      )}

      {/* Summary */}
      {summary.summary && (
        <div
          className="border px-4 py-3 transition-colors"
          style={{
            borderRadius: 'var(--radius-md)',
            borderColor: reading
              ? 'color-mix(in srgb, var(--color-accent) 60%, transparent)'
              : 'color-mix(in srgb, var(--color-accent) 25%, transparent)',
            background: reading
              ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)'
              : 'color-mix(in srgb, var(--color-accent) 5%, transparent)',
          }}
        >
          <Markdown content={summary.summary} />
        </div>
      )}

      {/* Key Points */}
      {summary.keyPoints.length > 0 && (
        <DetailBlock icon={<HiLightBulb className="w-3.5 h-3.5" />} label="Key Points" color="cyan">
          <ul className="space-y-1">
            {summary.keyPoints.map((kp, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1 shrink-0" style={{ color: 'var(--color-accent)' }}>•</span>
                <span className="flex-1 min-w-0" style={{ opacity: 0.85 }}>
                  <Markdown content={kp} compact />
                </span>
              </li>
            ))}
          </ul>
        </DetailBlock>
      )}

      {/* Formulas */}
      {summary.formulas.length > 0 && (
        <DetailBlock icon={<HiCalculator className="w-3.5 h-3.5" />} label="Formulas" color="teal">
          <div className="space-y-1.5">
            {summary.formulas.map((f, i) => (
              <Markdown key={i} content={f} compact className="[&_pre]:my-0" />
            ))}
          </div>
        </DetailBlock>
      )}

      {/* Definitions */}
      {summary.definitions.length > 0 && (
        <DetailBlock icon={<HiBookOpen className="w-3.5 h-3.5" />} label="Definitions" color="purple">
          <ul className="space-y-1.5">
            {summary.definitions.map((d, i) => (
              <li
                key={i}
                className="pl-3 border-l-2"
                style={{ borderColor: 'color-mix(in srgb, var(--color-accent-2-700) 40%, transparent)', opacity: 0.85 }}
              >
                <Markdown content={d} compact />
              </li>
            ))}
          </ul>
        </DetailBlock>
      )}
    </div>
  );
}

// ── Shared detail block (mirrors ChapterAnalysisPanel style) ──────────────

interface DetailBlockProps {
  icon: React.ReactNode;
  label: string;
  color: 'cyan' | 'teal' | 'purple';
  children: React.ReactNode;
}

function DetailBlock({ icon, label, color, children }: DetailBlockProps) {
  const accent =
    color === 'cyan'
      ? 'var(--color-accent-700)'
      : color === 'teal'
        ? 'var(--color-accent-600)'
        : 'var(--color-accent-2-700)';
  return (
    <div>
      <div
        className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold uppercase tracking-wide"
        style={{ color: accent }}
      >
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}
