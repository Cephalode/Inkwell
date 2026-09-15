import { useState, useEffect, useMemo } from 'react';
import {
  HiSparkles,
  HiCheck,
  HiClock,
  HiChevronDown,
  HiChevronRight,
  HiLightBulb,
  HiCalculator,
  HiBookOpen,
  HiExclamation,
  HiRefresh,
  HiDocumentText,
  HiVolumeUp,
} from 'react-icons/hi';
import Spinner from '../shared/Spinner';
import Badge from '../shared/Badge';
import Markdown from '../shared/Markdown';
import { useChapterAnalysis } from '../../hooks/useChapterAnalysis';
import { useTTSStore } from '../../store/ttsStore';
import VideoList from './VideoList';
import type { SubsectionAnalysis } from '../../types/analysis';

/**
 * Compose a subsection's text for speech. `includeDefinitions` controls
 * whether definitions are appended — the per-subsection Listen button
 * includes them, while the "Read All" sequence omits them for brevity.
 */
function buildSubsectionText(result: SubsectionAnalysis, includeDefinitions = true): string {
  const parts: string[] = [];
  if (result.title) parts.push(result.title);
  if (result.summary) parts.push(result.summary);
  if (result.keyPoints.length > 0) parts.push('Key points. ' + result.keyPoints.join('. '));
  if (includeDefinitions && result.definitions.length > 0) {
    parts.push('Definitions. ' + result.definitions.join('. '));
  }
  return parts.filter(Boolean).join('. ');
}

interface ChapterAnalysisPanelProps {
  chapterId: string;
}

export default function ChapterAnalysisPanel({ chapterId }: ChapterAnalysisPanelProps) {
  const {
    status,
    subsections,
    results,
    currentSubsection,
    totalSubsections,
    chapterNotes,
    error,
    analyzeChapter,
  } = useChapterAnalysis();

  // Auto-trigger analysis whenever the chapter ID changes.
  useEffect(() => {
    if (chapterId) {
      analyzeChapter(chapterId);
    }
  }, [chapterId, analyzeChapter]);

  const handleRetry = () => {
    if (chapterId) analyzeChapter(chapterId);
  };

  const doneCount = results.filter(Boolean).length;

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--color-divider)' }}>
        <HiSparkles className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
        <h3 className="text-sm">AI Chapter Analysis</h3>
        <div className="flex-1" />
        <StatusBadge status={status} />
      </div>

      {/* Body — scrollable when long */}
      <div className="p-4 max-h-[700px] overflow-y-auto">
        {status === 'error' ? (
          <ErrorView message={error} onRetry={handleRetry} />
        ) : status === 'done' ? (
          <>
            <DoneView
              chapterNotes={chapterNotes}
              subsections={subsections}
              results={results}
              analyzedAt={undefined}
            />
            <VideoList chapterId={chapterId} subsections={subsections} />
          </>
        ) : (
          <ProgressView
            status={status}
            subsections={subsections}
            results={results}
            currentSubsection={currentSubsection}
            totalSubsections={totalSubsections}
            doneCount={doneCount}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  if (status === 'done') return <Badge color="green">Complete</Badge>;
  if (status === 'error') return <Badge color="red">Error</Badge>;
  if (status === 'idle' || status === 'loading-cache') return <Badge color="gray">Preparing</Badge>;
  return <Badge color="cyan">Working…</Badge>;
}

// ---------------------------------------------------------------------------
// Progress (non-terminal) view
// ---------------------------------------------------------------------------

interface ProgressViewProps {
  status: string;
  subsections: { title: string; startPage: number; endPage: number }[];
  results: (SubsectionAnalysis | undefined)[];
  currentSubsection: number;
  totalSubsections: number;
  doneCount: number;
}

function ProgressView({ status, subsections, results, currentSubsection, totalSubsections, doneCount }: ProgressViewProps) {
  const message =
    status === 'extracting'
      ? 'Extracting text from PDF…'
      : status === 'detecting'
        ? 'Detecting subsections…'
        : status === 'synthesizing'
          ? 'Synthesizing chapter notes…'
          : status === 'loading-cache' || status === 'idle'
            ? 'Preparing analysis…'
            : null; // 'analyzing' handled below

  // Early phases: single spinner + message.
  if (message) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10">
        <Spinner size="md" />
        <span className="text-sm" style={{ opacity: 0.75 }}>{message}</span>
      </div>
    );
  }

  // Map phase: progress bar + subsection list.
  const justDetected = subsections.length > 0 && currentSubsection < 0 && doneCount === 0;
  const progressPct = totalSubsections > 0 ? Math.round((doneCount / totalSubsections) * 100) : 0;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm mb-2">
          {justDetected ? (
            <>Found <span className="font-semibold" style={{ color: 'var(--color-accent-700)' }}>{totalSubsections}</span> subsections</>
          ) : (
            <>Analyzing subsection <span className="font-semibold" style={{ color: 'var(--color-accent-700)' }}>{Math.min(currentSubsection + 1, totalSubsections)}</span> of {totalSubsections}</>
          )}
        </p>
        {/* Progress bar */}
        <div
          className="h-2 w-full overflow-hidden"
          style={{ borderRadius: 'var(--radius-sm)', background: 'var(--color-neutral-200)' }}
        >
          <div
            className="h-full transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%`, background: 'var(--color-accent)' }}
          />
        </div>
        <p className="mt-1 text-xs" style={{ opacity: 0.5 }}>{doneCount}/{totalSubsections} complete · {progressPct}%</p>
      </div>

      {/* Subsection list with live status */}
      <ul className="space-y-2">
        {subsections.map((sub, i) => {
          const result = results[i];
          const isDone = !!result;
          const isActive = i === currentSubsection && !isDone;
          return (
            <li
              key={i}
              style={{
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-neutral-100)',
                border: '1px solid var(--color-divider)',
              }}
            >
              <div className="flex items-start gap-3 px-3 py-2.5">
                <SubsectionStatus done={isDone} active={isActive} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm truncate">{sub.title}</span>
                    <span className="text-xs shrink-0" style={{ opacity: 0.5 }}>pp. {sub.startPage}–{sub.endPage}</span>
                  </div>
                  {isActive && (
                    <span className="text-xs" style={{ color: 'var(--color-accent-700)' }}>analyzing…</span>
                  )}
                </div>
              </div>
              {/* Live-expand summary as each result arrives */}
              {result && (
                <div className="px-3 pb-3 -mt-1">
                  <Markdown content={result.summary} className="text-xs opacity-60" />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {status === 'analyzing' && doneCount >= totalSubsections && totalSubsections > 0 && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm" style={{ opacity: 0.6 }}>
          <Spinner size="sm" />
          Wrapping up…
        </div>
      )}
    </div>
  );
}

/** Status indicator: ✓ done / spinner active / clock pending. */
function SubsectionStatus({ done, active }: { done: boolean; active: boolean }) {
  if (done) return <HiCheck className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--color-success)' }} />;
  if (active) return <div className="mt-0.5 shrink-0"><Spinner size="sm" /></div>;
  return <HiClock className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--color-neutral-500)' }} />;
}

// ---------------------------------------------------------------------------
// Done view
// ---------------------------------------------------------------------------

interface DoneViewProps {
  chapterNotes: string;
  subsections: { title: string; startPage: number; endPage: number }[];
  results: (SubsectionAnalysis | undefined)[];
  analyzedAt?: string;
}

function DoneView({ chapterNotes, subsections, results, analyzedAt }: DoneViewProps) {
  const [notesOpen, setNotesOpen] = useState(true);
  // Default the first subsection open.
  const [openSet, setOpenSet] = useState<Set<number>>(() => new Set([0]));

  // ── Global TTS store ─────────────────────────────────────────────────
  // Subscribed via selectors so this panel reflects global playback state
  // (e.g. it re-highlights correctly after navigating away and back).
  const ttsIsSpeaking = useTTSStore((s) => s.isSpeaking);
  const ttsIsSequential = useTTSStore((s) => s.isSequential);
  const ttsCurrentSectionIndex = useTTSStore((s) => s.currentSectionIndex);
  const ttsCurrentTitle = useTTSStore((s) => s.currentTitle);
  const ttsSpeak = useTTSStore((s) => s.speak);
  const ttsSpeakSequence = useTTSStore((s) => s.speakSequence);
  const ttsStop = useTTSStore((s) => s.stop);

  const toggle = (i: number) => {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  // Merge detected subsection metadata with completed results.
  const merged = useMemo(() => {
    return subsections.map((sub, i) => ({
      index: i,
      sub,
      result: results[i],
    }));
  }, [subsections, results]);

  // Ordered list of section ids as they would be queued for "Read All".
  // Used to map the global currentSectionIndex back to a highlight id.
  const orderedIds = useMemo(() => {
    const ids: string[] = [];
    if (chapterNotes.trim()) ids.push('notes');
    merged.forEach(({ index, result }) => {
      if (result) ids.push(`sub-${index}`);
    });
    return ids;
  }, [chapterNotes, merged]);

  // Derive which section is currently being read from global TTS state.
  // - Sequential mode: index maps directly to orderedIds.
  // - Single speak: match by title.
  const readingSection = useMemo(() => {
    if (!ttsIsSpeaking) return null;
    if (ttsIsSequential) {
      return orderedIds[ttsCurrentSectionIndex] ?? null;
    }
    if (ttsCurrentTitle === 'Chapter Notes') return 'notes';
    const match = merged.find(({ result }) => result && result.title === ttsCurrentTitle);
    return match ? `sub-${match.index}` : null;
  }, [ttsIsSpeaking, ttsIsSequential, ttsCurrentSectionIndex, ttsCurrentTitle, orderedIds, merged]);

  /** Speak (or toggle off) a single section by id. */
  const listen = (id: string, text: string, title: string) => {
    if (!text.trim()) return;
    if (readingSection === id && ttsIsSpeaking) {
      ttsStop();
      return;
    }
    ttsSpeak(text, title);
  };

  /** Read everything sequentially; clicking again stops playback. */
  const readAll = () => {
    if (ttsIsSpeaking) {
      ttsStop();
      return;
    }
    const sections: { title: string; text: string }[] = [];
    if (chapterNotes.trim()) sections.push({ title: 'Chapter Notes', text: chapterNotes });
    merged.forEach(({ result }) => {
      if (!result) return;
      sections.push({ title: result.title, text: buildSubsectionText(result, false) });
    });
    if (sections.length === 0) return;
    ttsSpeakSequence(sections);
  };

  const notesReading = readingSection === 'notes';

  return (
    <div className="space-y-4">
      {/* Read All button */}
      <div>
        <button
          onClick={readAll}
          className={`btn ${ttsIsSpeaking ? '' : 'btn-primary'} transition-colors`}
          style={
            ttsIsSpeaking
              ? {
                  background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                  color: 'var(--color-accent-700)',
                  borderColor: 'color-mix(in srgb, var(--color-accent) 40%, transparent)',
                }
              : undefined
          }
        >
          <HiVolumeUp className={`w-4 h-4 ${ttsIsSpeaking ? 'animate-pulse' : ''}`} />
          {ttsIsSpeaking ? 'Stop Reading' : 'Read All Aloud'}
        </button>
      </div>

      {/* Chapter-level notes — prominent, collapsible */}
      {chapterNotes && (
        <div
          className="transition-colors"
          style={{
            borderRadius: 'var(--radius-md)',
            border: notesReading
              ? '1px solid var(--color-accent)'
              : '1px solid color-mix(in srgb, var(--color-accent) 35%, transparent)',
            background: notesReading
              ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)'
              : 'color-mix(in srgb, var(--color-accent) 5%, transparent)',
          }}
        >
          <div className="flex items-center gap-1 w-full px-4 py-3">
            <button
              onClick={() => setNotesOpen((v) => !v)}
              className="flex items-center gap-2 flex-1 min-w-0 text-left"
            >
              {notesOpen ? (
                <HiChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
              ) : (
                <HiChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
              )}
              <HiLightBulb className="w-4 h-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--color-accent-700)' }}>Chapter Key Notes</span>
              {notesReading && (
                <HiVolumeUp className="w-3.5 h-3.5 animate-pulse shrink-0" style={{ color: 'var(--color-accent-700)' }} />
              )}
            </button>
            {analyzedAt && (
              <span className="text-xs shrink-0" style={{ opacity: 0.5 }}>
                {new Date(analyzedAt).toLocaleDateString()}
              </span>
            )}
            <button
              onClick={() => listen('notes', chapterNotes, 'Chapter Notes')}
              title={notesReading ? 'Stop' : 'Listen to chapter notes'}
              aria-label={notesReading ? 'Stop reading chapter notes' : 'Listen to chapter notes'}
              className="inline-flex items-center justify-center w-7 h-7 hover:bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] transition-colors shrink-0"
              style={{ borderRadius: 'var(--radius-md)', color: 'var(--color-accent-700)' }}
            >
              <HiVolumeUp className={`w-4 h-4 ${notesReading ? 'animate-pulse' : ''}`} />
            </button>
          </div>
          {notesOpen && (
            <div className="px-4 pb-4 -mt-1">
              <Markdown content={chapterNotes} />
            </div>
          )}
        </div>
      )}

      {/* Subsection analyses — accordion */}
      <div className="space-y-2">
        {merged.map(({ index, sub, result }) => (
          <SubsectionAccordion
            key={index}
            index={index}
            title={sub.title}
            startPage={sub.startPage}
            endPage={sub.endPage}
            result={result}
            open={openSet.has(index)}
            onToggle={() => toggle(index)}
            onListen={
              result
                ? () => listen(`sub-${index}`, buildSubsectionText(result, true), result.title)
                : undefined
            }
            isReading={readingSection === `sub-${index}`}
          />
        ))}
      </div>
    </div>
  );
}

interface SubsectionAccordionProps {
  index: number;
  title: string;
  startPage: number;
  endPage: number;
  result?: SubsectionAnalysis;
  open: boolean;
  onToggle: () => void;
  onListen?: () => void;
  isReading?: boolean;
}

function SubsectionAccordion({
  index,
  title,
  startPage,
  endPage,
  result,
  open,
  onToggle,
  onListen,
  isReading = false,
}: SubsectionAccordionProps) {
  const readingStyle: React.CSSProperties = isReading
    ? {
        border: '1px solid var(--color-accent)',
        background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
      }
    : {
        border: '1px solid var(--color-divider)',
        background: 'var(--color-neutral-100)',
      };
  return (
    <div className="transition-colors" style={{ borderRadius: 'var(--radius-md)', ...readingStyle }}>
      <div className="flex items-center gap-1 px-3 py-2.5">
        <button
          onClick={onToggle}
          className="flex items-center gap-2 flex-1 min-w-0 text-left hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] transition-colors -mx-1 px-1 py-0.5"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          {open ? (
            <HiChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--color-neutral-600)' }} />
          ) : (
            <HiChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--color-neutral-600)' }} />
          )}
          <HiDocumentText className="w-4 h-4 shrink-0" style={{ color: 'var(--color-accent)', opacity: 0.8 }} />
          <span className="text-sm font-medium flex-1 min-w-0 truncate">
            {index + 1}. {result?.title || title}
          </span>
        </button>
        <span className="text-xs shrink-0" style={{ opacity: 0.5 }}>pp. {startPage}–{endPage}</span>
        {isReading && (
          <HiVolumeUp className="w-3.5 h-3.5 animate-pulse shrink-0" style={{ color: 'var(--color-accent-700)' }} />
        )}
        {result && onListen && (
          <button
            onClick={onListen}
            title={isReading ? 'Stop' : 'Listen to this subsection'}
            aria-label={isReading ? 'Stop reading subsection' : 'Listen to this subsection'}
            className="inline-flex items-center justify-center w-7 h-7 hover:bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] transition-colors shrink-0"
            style={{
              borderRadius: 'var(--radius-md)',
              color: isReading ? 'var(--color-accent-700)' : 'var(--color-neutral-600)',
            }}
          >
            <HiVolumeUp className={`w-4 h-4 ${isReading ? 'animate-pulse' : ''}`} />
          </button>
        )}
      </div>

      {open && result && (
        <div className="px-3 pb-3 space-y-3">
          <Markdown content={result.summary} />

          {result.keyPoints.length > 0 && (
            <DetailBlock icon={<HiLightBulb className="w-3.5 h-3.5" />} label="Key Points" color="cyan">
              <ul className="space-y-1">
                {result.keyPoints.map((kp, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1 shrink-0" style={{ color: 'var(--color-accent)' }}>•</span>
                    <span className="flex-1 min-w-0">
                      <Markdown content={kp} compact />
                    </span>
                  </li>
                ))}
              </ul>
            </DetailBlock>
          )}

          {result.formulas.length > 0 && (
            <DetailBlock icon={<HiCalculator className="w-3.5 h-3.5" />} label="Formulas" color="teal">
              <div className="space-y-1.5">
                {result.formulas.map((f, i) => (
                  <Markdown key={i} content={f} compact className="[&_pre]:my-0" />
                ))}
              </div>
            </DetailBlock>
          )}

          {result.definitions.length > 0 && (
            <DetailBlock icon={<HiBookOpen className="w-3.5 h-3.5" />} label="Definitions" color="purple">
              <ul className="space-y-1.5">
                {result.definitions.map((d, i) => (
                  <li
                    key={i}
                    className="pl-3"
                    style={{ borderLeft: '2px solid color-mix(in srgb, var(--color-accent-2-700) 40%, transparent)' }}
                  >
                    <Markdown content={d} compact />
                  </li>
                ))}
              </ul>
            </DetailBlock>
          )}
        </div>
      )}
    </div>
  );
}

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

// ---------------------------------------------------------------------------
// Error view
// ---------------------------------------------------------------------------

function ErrorView({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
      <HiExclamation className="w-8 h-8" style={{ color: 'var(--color-danger)' }} />
      <p className="text-sm max-w-sm" style={{ color: 'var(--color-danger)' }}>
        {message || 'Something went wrong during analysis.'}
      </p>
      <button onClick={onRetry} className="btn btn-primary">
        <HiRefresh className="w-4 h-4" />
        Retry
      </button>
    </div>
  );
}
