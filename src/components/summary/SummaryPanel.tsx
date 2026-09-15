import { useEffect, useState } from 'react';
import Spinner from '../shared/Spinner';
import Button from '../shared/Button';
import Card from '../shared/Card';
import Markdown from '../shared/Markdown';
import { HiRefresh } from 'react-icons/hi';

interface SummaryPanelProps {
  /** Auto-generated markdown summary (TL;DR + Key Points), from the server. */
  summary?: string | null;
  /** 'pending' | 'generating' | 'done' | 'failed' | 'skipped' */
  summaryStatus?: string;
  /** Read the doc's current summary state from the server (used to poll). */
  onPoll: () => Promise<void>;
  /** Regenerate after a failure. */
  onRetry: () => Promise<void>;
}

/**
 * Read-only view of the document's auto-generated summary.
 *
 * Summaries are generated automatically when the document is added (chained
 * after classification server-side) — there is no generate button. While a
 * generation is in flight the panel polls the doc state; if generation
 * failed, a Retry button re-triggers it.
 */
export default function SummaryPanel({ summary, summaryStatus, onPoll, onRetry }: SummaryPanelProps) {
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const failed = summaryStatus === 'failed';
  const generating = !failed && (summaryStatus === 'generating' || summaryStatus === 'pending');

  // Poll while the server-side auto-summary is in flight. Bounded: if it
  // never resolves (stuck server), fall through to the retry UI.
  const [pollCount, setPollCount] = useState(0);
  const [lastStatus, setLastStatus] = useState('');
  if (summaryStatus !== lastStatus) {
    setLastStatus(summaryStatus);
    setPollCount(0); // adjust-state-on-render: reset the bounded poll per status change
  }
  useEffect(() => {
    if (!generating || pollCount >= 24) return; // ~2 min at 5s intervals
    let cancelled = false;
    const t = setTimeout(() => {
      onPoll()
        .catch(() => {}) // transient poll errors are non-fatal; keep trying
        .finally(() => { if (!cancelled) setPollCount((c) => c + 1); });
    }, 5000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [generating, pollCount, onPoll]);

  const stalled = generating && pollCount >= 24;

  const handleRetry = async () => {
    setRetrying(true);
    setError(null);
    try {
      await onRetry();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Summary generation failed');
    } finally {
      setRetrying(false);
    }
  };

  if (summary) {
    return (
      <Card>
        <div className="max-w-none">
          <Markdown content={summary} />
        </div>
      </Card>
    );
  }

  if ((generating && !stalled) || retrying) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10">
        <Spinner size="md" />
        <span className="text-sm" style={{ opacity: 0.75 }}>Generating summary…</span>
      </div>
    );
  }

  if (failed || error || stalled) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
        <p className="text-sm max-w-sm" style={{ color: 'var(--color-danger)' }}>
          {error || (stalled ? 'Summary generation is taking unusually long.' : 'Summary generation failed.')}
        </p>
        <Button size="sm" variant="secondary" onClick={handleRetry}>
          <HiRefresh className="w-4 h-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (summaryStatus === 'skipped') {
    return (
      <div className="text-center py-10 text-sm" style={{ opacity: 0.5 }}>
        No summary available for this document.
      </div>
    );
  }

  return null;
}
