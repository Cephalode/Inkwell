import { useEffect, useRef, useState } from 'react';
import Spinner from '../shared/Spinner';
import Button from '../shared/Button';
import Card from '../shared/Card';
import { HiRefresh, HiPlay } from 'react-icons/hi';

interface PodcastSectionData {
  title: string;
  durationS: number;
  sections: { title: string; startS: number; durationS?: number; lines: { speaker: 'host' | 'guest'; text: string; startS: number }[] }[];
}

interface PodcastPanelProps {
  docId: string;
  /** 'pending' | 'generating' | 'done' | 'failed' | 'skipped' */
  podcastStatus?: string;
  /** Server-persisted failure reason (failures are data). */
  podcastError?: string | null;
  /** v2 sectioned transcript with timestamps (null for pre-v2 podcasts). */
  podcastSections?: PodcastSectionData | null;
  /** True when the doc has a summary (podcast needs it as source material). */
  hasSummary: boolean;
  /** Read the doc's current state from the server (used to poll). */
  onPoll: () => Promise<void>;
  /** Kick off generation (retry / manual start). */
  onGenerate: () => Promise<void>;
}

/**
 * Podcast audio overview: a ~5-minute two-voice dialogue generated from the
 * document's summary. Auto-generated server-side after the summary completes;
 * this panel polls while generating and offers retry on failure. Audio is
 * served from POST/GET /api/documents/:id/podcast.
 */
export default function PodcastPanel({ docId, podcastStatus, podcastError, podcastSections, hasSummary, onPoll, onGenerate }: PodcastPanelProps) {
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cache-buster so a fresh MP3 after regeneration isn't served from cache.
  const [audioKey, setAudioKey] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const done = podcastStatus === 'done';
  const failed = podcastStatus === 'failed';
  const generating = !failed && (podcastStatus === 'generating' || podcastStatus === 'pending');

  // Poll while the server-side generation is in flight. Bounded (~4 min):
  // script (GLM ~30-90s) + TTS segments can take a while.
  const [pollCount, setPollCount] = useState(0);
  const [lastStatus, setLastStatus] = useState('');
  const [startedAt, setStartedAt] = useState(0);
  if (podcastStatus !== lastStatus) {
    setLastStatus(podcastStatus ?? '');
    setPollCount(0); // adjust-state-on-render: reset the bounded poll per status change
    setStartedAt(Date.now()); // drives the elapsed label while generating
  }
  useEffect(() => {
    if (!generating || pollCount >= 48) return; // ~4 min at 5s intervals
    let cancelled = false;
    const t = setTimeout(() => {
      onPoll()
        .catch(() => {}) // transient poll errors are non-fatal; keep trying
        .finally(() => { if (!cancelled) setPollCount((c) => c + 1); });
    }, 5000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [generating, pollCount, onPoll]);

  const stalled = generating && pollCount >= 48;

  const handleGenerate = async () => {
    setRetrying(true);
    setError(null);
    try {
      await onGenerate();
      setAudioKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Podcast generation failed');
    } finally {
      setRetrying(false);
    }
  };

  if (done) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <span
            className="flex items-center justify-center w-10 h-10 shrink-0"
            style={{ background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)', color: 'var(--color-accent)', borderRadius: 'var(--radius-md)' }}
          >
            <HiPlay className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold">{podcastSections?.title || 'Podcast overview'}</h4>
            <p className="text-xs" style={{ opacity: 0.5 }}>Two-host discussion of this document</p>
          </div>
        </div>
        <audio
          key={audioKey}
          ref={audioRef}
          controls
          className="w-full mt-3"
          src={`/api/documents/${docId}/podcast?v=${audioKey}`}
          preload="none"
          onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        />
        {podcastSections && (
          <PodcastTranscript data={podcastSections} currentTime={currentTime} onSeek={(s) => {
            const a = audioRef.current;
            if (a) { a.currentTime = s; void a.play().catch(() => {}); }
          }} />
        )}
      </Card>
    );
  }

  if ((generating && !stalled) || retrying) {
    const elapsed = startedAt ? Math.round((Date.now() - startedAt) / 15000) * 15 : 0;
    return (
      <Card>
        <div className="flex flex-col items-center justify-center gap-3 py-8">
          <Spinner size="md" />
          <span className="text-sm" style={{ opacity: 0.75 }}>
            Generating podcast…{elapsed > 0 ? ` (${elapsed}s)` : ''}
          </span>
        </div>
      </Card>
    );
  }

  if (failed || error || stalled) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <p className="text-sm max-w-sm" style={{ color: 'var(--color-danger)' }}>
            {error || podcastError || (stalled ? 'Podcast generation is taking unusually long.' : 'Podcast generation failed.')}
          </p>
          <Button size="sm" variant="secondary" onClick={handleGenerate}>
            <HiRefresh className="w-4 h-4" />
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  if (podcastStatus === 'skipped') {
    return null;
  }

  // pending with no summary yet — offer a manual start (the auto chain will
  // also fire once the summary completes; first one to run wins).
  if (!hasSummary) {
    return (
      <Card>
        <div className="text-center py-6">
          <p className="text-sm mb-3" style={{ opacity: 0.6 }}>
            A two-host podcast of this document can be generated once its summary is ready.
          </p>
          <Button size="sm" variant="secondary" onClick={handleGenerate}>
            <HiPlay className="w-4 h-4" />
            Generate podcast
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="text-center py-6">
        <Button size="sm" variant="secondary" onClick={handleGenerate}>
          <HiPlay className="w-4 h-4" />
          Generate podcast now
        </Button>
      </div>
    </Card>
  );
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Section list + synced transcript. Active line = last line with startS <= currentTime. */
function PodcastTranscript({ data, currentTime, onSeek }: {
  data: PodcastSectionData;
  currentTime: number;
  onSeek: (seconds: number) => void;
}) {
  const [showTranscript, setShowTranscript] = useState(false);
  const activeRef = useRef<HTMLParagraphElement>(null);
  const allLines = data.sections.flatMap((s) => s.lines);
  const activeIdx = showTranscript
    ? allLines.reduce((acc, l, i) => (l.startS <= currentTime ? i : acc), 0)
    : -1;

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIdx]);

  return (
    <div className="mt-3 space-y-2">
      {/* Section list — click seeks */}
      <div className="flex flex-wrap gap-1.5">
        {data.sections.map((s) => (
          <button
            key={`${s.title}-${s.startS}`}
            onClick={() => onSeek(s.startS)}
            className="btn btn-ghost text-xs"
            style={{ padding: '2px 8px', border: '1px solid var(--color-neutral-300)' }}
            title={s.durationS ? fmt(s.durationS) : undefined}
          >
            {s.title}
            {s.durationS ? <span style={{ opacity: 0.5 }}> · {fmt(s.durationS)}</span> : null}
          </button>
        ))}
        <button
          onClick={() => setShowTranscript((v) => !v)}
          className="btn btn-ghost text-xs"
          style={{ padding: '2px 8px', border: '1px solid var(--color-neutral-300)' }}
        >
          {showTranscript ? 'Hide transcript' : 'Transcript'}
        </button>
      </div>

      {/* Synced transcript */}
      {showTranscript && (
        <div className="space-y-1.5" style={{ maxHeight: 280, overflowY: 'auto' }}>
          {allLines.map((l, i) => (
            <p
              key={i}
              ref={i === activeIdx ? activeRef : undefined}
              onClick={() => onSeek(l.startS)}
              className="text-sm cursor-pointer"
              style={{
                opacity: i === activeIdx ? 1 : 0.55,
                fontWeight: i === activeIdx ? 600 : 400,
                paddingLeft: 8,
                borderLeft: `2px solid ${i === activeIdx ? 'var(--color-accent)' : 'transparent'}`,
              }}
            >
              <span style={{ opacity: 0.5, fontSize: 12 }}>{l.speaker === 'host' ? 'Host' : 'Guest'} · {fmt(l.startS)}</span>
              <br />
              {l.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
