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
import { useTTSStore } from '../../store/ttsStore';
import type { VideoSummary } from '../../types/document';

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
  // polling completes in the hook).
  useEffect(() => {
    if (existingSummary) {
      setSummary(existingSummary);
      setStatus('done');
    }
  }, [existingSummary]);

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

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

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

          const dataLine = rawEvent
            .split('\n')
            .map((l) => l.trim())
            .find((l) => l.startsWith('data: '));
          if (!dataLine) continue;

          const payload = dataLine.slice(6);
          let evt: any;
          try {
            evt = JSON.parse(payload);
          } catch {
            continue;
          }

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
        }
      }
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
        <div className="w-12 h-12 flex items-center justify-center rounded-full bg-cyan-500/10">
          <HiSparkles className="w-6 h-6 text-cyan-400" />
        </div>
        <p className="text-sm text-slate-300 max-w-sm">
          Generate an AI-powered summary of this video's transcript — key points, formulas, definitions, and topics.
        </p>
        <button
          onClick={generate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium transition-colors"
        >
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
        <span className="text-sm text-slate-300">{analyzingMessage}</span>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────
  if (status === 'error' && !summary) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
        <HiExclamation className="w-8 h-8 text-red-400" />
        <p className="text-sm text-red-300 max-w-sm">
          {error || 'Something went wrong while generating the summary.'}
        </p>
        <button
          onClick={generate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium transition-colors"
        >
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
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
            reading && ttsIsSpeaking
              ? 'bg-cyan-500/15 text-cyan-200 border-cyan-500/40 hover:bg-cyan-500/25'
              : 'bg-cyan-600 hover:bg-cyan-700 text-white border-cyan-500/50'
          }`}
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
          className={`rounded-lg border px-4 py-3 transition-colors ${
            reading
              ? 'border-cyan-500/60 bg-cyan-950/30 shadow-[0_0_12px_-2px_rgba(34,211,238,0.35)]'
              : 'border-cyan-900/40 bg-cyan-950/20'
          }`}
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
                <span className="text-cyan-400 mt-1 shrink-0">•</span>
                <span className="flex-1 min-w-0 text-slate-300">
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
              <li key={i} className="pl-3 border-l-2 border-purple-500/40 text-slate-300">
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
      ? 'text-cyan-300'
      : color === 'teal'
        ? 'text-teal-300'
        : 'text-purple-300';
  return (
    <div>
      <div className={`flex items-center gap-1.5 mb-1.5 text-xs font-semibold uppercase tracking-wide ${accent}`}>
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}
