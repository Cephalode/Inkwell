import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import {
  HiArrowLeft,
  HiCheck,
  HiChevronDown,
  HiChevronUp,
  HiOutlineArrowsPointingIn,
  HiOutlineArrowsPointingOut,
  HiOutlineArrowTopRightOnSquare,
  HiOutlinePlay,
  HiOutlineQueueList,
  HiOutlineSparkles,
} from 'react-icons/hi2';
import Badge from '../components/shared/Badge';
import Spinner from '../components/shared/Spinner';
import { MasteryPill } from '../components/learn/ActivityOutcome';
import { useIsMobile } from '../hooks/useIsMobile';
import { useVideoStore } from '../store/videoStore';
import { MASTERY_LABEL } from '../types/learning';
import { formatDuration, type VideoMilestone, type WatchQuizQuestion, type WatchedResponse } from '../types/videos';
import { getWatchQuiz } from '../services/api/videos';

type Navigate = (to: string) => void;
type Chapter = VideoMilestone & { startSeconds: number };

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const rowStyle: CSSProperties = { padding: '14px 0', borderTop: '1px solid var(--color-neutral-300)' };

const chipStyle: CSSProperties = {
  font: '600 12px var(--font-body)',
  padding: '3px 10px',
  borderRadius: 999,
  border: '1px solid var(--color-neutral-300)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  cursor: 'pointer',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const smallBtn = 'text-[13px] px-2.5 py-1';

/** YouTube's standard playback-rate steps; '<' steps down, '>' steps up. */
const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/** Send a command to every YouTube embed on the page via the iframe
 *  postMessage API (needs enablejsapi=1&origin on the embed URL). Commands
 *  sent before the player finishes initializing are silently dropped. */
const postYTCommand = (func: string, args: unknown[]) => {
  document.querySelectorAll<HTMLIFrameElement>('iframe[src*="youtube.com/embed"]').forEach((f) => {
    try {
      f.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), 'https://www.youtube.com');
    } catch {
      /* guarded anyway */
    }
  });
};

/** /learn/videos/:videoId — watch a judged video, jump to the part that
 *  teaches each milestone, and mark it watched for XP + mastery evidence. */
export default function VideoPage() {
  const { videoId } = useParams<{ videoId: string }>();
  if (!videoId) return <NotFound />;
  // Keyed so opening another video resets the player, chapter and outcome state.
  return <VideoView key={videoId} videoId={videoId} />;
}

function NotFound({ title = 'Video not found', message }: { title?: string; message?: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="mb-1" style={{ fontSize: 18 }}>
        {title}
      </p>
      <p className="mb-5 max-w-sm text-sm" style={{ opacity: 0.6 }}>
        {message ?? 'This video is not in your library, or it has been removed.'}
      </p>
      <button type="button" className="btn btn-secondary" onClick={() => navigate('/learn/videos')}>
        <HiArrowLeft className="h-4 w-4" />
        Back to Videos
      </button>
    </div>
  );
}

function Note({ tone, children }: { tone: 'success' | 'danger' | 'accent'; children: ReactNode }) {
  const color = `var(--color-${tone})`;
  return (
    <div
      className="flex items-start gap-2 text-sm"
      style={{
        padding: '8px 12px',
        borderRadius: 'var(--radius-md)',
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        color,
      }}
    >
      {children}
    </div>
  );
}

function CoverageBar({ fraction, muted }: { fraction: number; muted: boolean }) {
  const p = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return (
    <div
      className="h-1.5 w-full overflow-hidden"
      style={{ background: 'var(--color-neutral-200)', borderRadius: 999 }}
      role="progressbar"
      aria-label="Coverage"
      aria-valuenow={p}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        style={{
          width: `${p}%`,
          height: '100%',
          background: muted ? 'var(--color-success)' : 'var(--color-accent)',
          transition: 'width .3s',
        }}
      />
    </div>
  );
}

/** One milestone the video was judged against. Learned ones are muted —
 *  the video still covers them, but they no longer cost the learner time. */
function MilestoneRow({
  m,
  active,
  onJump,
  navigate,
}: {
  m: VideoMilestone;
  active: boolean;
  onJump?: () => void;
  navigate: Navigate;
}) {
  const learned = m.mastery === 'learned';
  const shared = m.courses.length > 1;
  const pct = Math.round(Math.max(0, Math.min(1, m.coverage)) * 100);
  return (
    <div style={{ ...rowStyle, opacity: learned ? 0.55 : 1 }}>
      <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
        <span className="min-w-0 flex-1 font-semibold" style={{ fontSize: 15 }}>
          {m.label}
        </span>
        <MasteryPill mastery={m.mastery} />
        {learned && <span style={{ fontSize: 12, opacity: 0.7 }}>already learned</span>}
      </div>

      <div className="flex items-center" style={{ gap: 10, marginTop: 8 }}>
        <div className="flex-1">
          <CoverageBar fraction={m.coverage} muted={learned} />
        </div>
        <span className="whitespace-nowrap text-right" style={{ fontSize: 12.5, opacity: 0.65, minWidth: 110 }}>
          {pct}% of objectives
        </span>
      </div>

      {m.objectivesCovered.length > 0 && (
        <ul className="space-y-1" style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }}>
          {m.objectivesCovered.map((o, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <HiCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: learned ? 'var(--color-success)' : 'var(--color-accent)' }} />
              <span>{o}</span>
            </li>
          ))}
        </ul>
      )}

      {m.reason && (
        <p className="text-sm" style={{ opacity: 0.65, margin: '8px 0 0', lineHeight: 1.5 }}>
          {m.reason}
        </p>
      )}

      <div className="flex flex-wrap items-center" style={{ gap: 6, marginTop: 10 }}>
        {shared && (
          <span style={{ fontSize: 12, color: 'var(--color-accent-700)', marginRight: 2 }}>
            Shared by {m.courses.length} courses
          </span>
        )}
        {m.courses.map((c) => (
          <button
            key={c.stepId}
            type="button"
            style={chipStyle}
            title={`Open this milestone in ${c.courseName}`}
            onClick={() => navigate(`/learn/steps/${c.stepId}`)}
          >
            {shared ? `Also in ${c.courseName}` : c.courseName}
          </button>
        ))}
        {onJump && m.startSeconds !== null && (
          <button
            type="button"
            className={`btn btn-ghost ${smallBtn}`}
            style={{ marginLeft: 'auto' }}
            aria-pressed={active}
            onClick={onJump}
          >
            <HiOutlinePlay className="h-3.5 w-3.5" />
            {active ? 'Playing' : `Watch from ${formatDuration(m.startSeconds)}`}
          </button>
        )}
      </div>
    </div>
  );
}

/** Full-viewport theatre mode: a fixed black backdrop replaces all page chrome
 *  (Layout hides TopBar/main/tab bar while `theatreMode` is set). The player
 *  box grows to whichever dimension hits the viewport edge first, using
 *  `width: min(100vw, 100vh × 16/9)` — the 16:9 box always touches an edge on
 *  both axes' limiting side. Chapters stay reachable in a top-corner overlay.
 *  Esc or the button exits; leaving the page also resets the store flag. */
function TheatrePlayer({
  embedSrc,
  title,
  onExit,
  speedHint,
  children,
}: {
  embedSrc: string;
  title: string;
  onExit: () => void;
  /** Non-null shows a transient "1.5×"-style indicator on the player. */
  speedHint: number | null;
  /** Chapter panel content (the normal-mode chapters list). */
  children: ReactNode;
}) {
  const [chaptersOpen, setChaptersOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  const boxStyle: CSSProperties = {
    width: 'min(100vw, calc(100vh * 16 / 9))',
    aspectRatio: '16 / 9',
    background: '#000',
    overflow: 'hidden',
  };

  // Portaled to <body>: an in-tree overlay would (a) be clipped/offset by
  // ancestor overflow/filters and (b) its fixed positioning would still work
  // but the page behind keeps whatever height it has — portaling to body
  // guarantees the backdrop covers the full viewport on every browser.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black">
      <div className="relative" style={boxStyle}>
        <iframe
          key={embedSrc}
          src={embedSrc}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
        />

        {speedHint !== null && (
          <div
            aria-live="polite"
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              zIndex: 5,
              padding: '4px 10px',
              borderRadius: 999,
              background: 'rgba(0,0,0,0.7)',
              color: '#fff',
              font: '600 13px var(--font-body)',
            }}
          >
            {speedHint}×
          </div>
        )}

        {/* Top-right controls: exit theatre, toggle the chapter overlay. */}
        <div className="absolute right-2 top-2 flex items-center gap-1.5">
          <button
            type="button"
            className="btn btn-ghost flex items-center gap-1.5 text-white hover:bg-white/15"
            style={{ background: 'rgba(0,0,0,0.55)' }}
            aria-pressed={chaptersOpen}
            aria-expanded={chaptersOpen}
            title="Chapters"
            onClick={() => setChaptersOpen((o) => !o)}
          >
            <HiOutlineQueueList className="h-4 w-4" />
            Chapters
          </button>
          <button
            type="button"
            className="btn btn-ghost flex items-center gap-1.5 text-white hover:bg-white/15"
            style={{ background: 'rgba(0,0,0,0.55)' }}
            onClick={onExit}
            title="Exit theatre mode (Esc)"
          >
            <HiOutlineArrowsPointingIn className="h-4 w-4" />
            Exit theatre
          </button>
        </div>

        {/* Chapter list overlay, dismissed with the same button or a click outside. */}
        {chaptersOpen && (
          <div className="absolute inset-0 z-10 flex items-start justify-end" onClick={() => setChaptersOpen(false)}>
            <div
              className="max-h-full overflow-y-auto"
              style={{
                margin: 12,
                width: 280,
                maxWidth: 'calc(100% - 24px)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-lg)',
                background: 'rgba(10,10,10,0.92)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="section-label" style={{ margin: '0 0 6px', color: 'rgba(255,255,255,0.85)' }}>
                Chapters
              </h3>
              {children}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function VideoView({ videoId }: { videoId: string }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const video = useVideoStore((s) => s.videosById[videoId]);
  const loadVideo = useVideoStore((s) => s.loadVideo);
  const markWatched = useVideoStore((s) => s.markWatched);

  const [loadError, setLoadError] = useState<string | null>(null);
  /** Where the embed starts; set by the chapter list (re-renders the iframe). */
  const [start, setStart] = useState<{ seconds: number; skillId: string | null; autoplay: boolean }>({
    seconds: 0,
    skillId: null,
    autoplay: false,
  });
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<WatchedResponse | null>(null);
  /** Pre-watch comprehension check: loaded on first "Mark as watched". */
  const [quiz, setQuiz] = useState<WatchQuizQuestion[] | null>(null);
  const [quizOpen, setQuizOpen] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  /** Per-question correctness from a rejected attempt (400 from the server). */
  const [quizResults, setQuizResults] = useState<boolean[] | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const quizRef = useRef<HTMLDivElement>(null);
  const [theatreMode, setTheatreMode] = useState(false);

  // Lock page scroll while the theatre overlay covers the screen.
  useEffect(() => {
    if (!theatreMode) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [theatreMode]);

  /** Desired playback rate, tracked parent-side (the cross-origin player
   *  can't be queried). '<' steps down, '>' steps up, YouTube-style. */
  const [rate, setRate] = useState(1);
  const [speedHint, setSpeedHint] = useState<number | null>(null);
  const hintTimer = useRef<number | null>(null);

  const changeRate = useCallback(
    (dir: 1 | -1) => {
      const idx = PLAYBACK_RATES.indexOf(rate);
      const next = PLAYBACK_RATES[Math.min(PLAYBACK_RATES.length - 1, Math.max(0, (idx === -1 ? PLAYBACK_RATES.indexOf(1) : idx) + dir))];
      setRate(next);
      postYTCommand('setPlaybackRate', [next]);
      setSpeedHint(next);
      if (hintTimer.current) window.clearTimeout(hintTimer.current);
      hintTimer.current = window.setTimeout(() => setSpeedHint(null), 1200);
    },
    [rate],
  );

  // Window-level so it works in theatre mode too; skips while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '<' && e.key !== '>') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      changeRate(e.key === '>' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [changeRate]);

  // Iframes come back at 1× after any remount (chapter jump, theatre enter/
  // exit) — re-apply the chosen rate on each embed load. Commands sent
  // before the player finishes initializing are dropped, hence retries.
  const rateRef = useRef(rate);
  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);
  useEffect(() => {
    const onLoad = (e: Event) => {
      const f = e.target as HTMLIFrameElement | null;
      if (!f || !f.src || !f.src.includes('youtube.com/embed')) return;
      const wanted = rateRef.current;
      if (wanted === 1) return;
      let tries = 0;
      const timer = window.setInterval(() => {
        tries += 1;
        postYTCommand('setPlaybackRate', [wanted]);
        if (tries >= 8) window.clearInterval(timer);
      }, 400);
    };
    window.addEventListener('load', onLoad, true);
    return () => window.removeEventListener('load', onLoad, true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadVideo(videoId, true).catch((err: unknown) => {
      if (!cancelled) setLoadError(errorMessage(err));
    });
    return () => {
      cancelled = true;
    };
  }, [videoId, loadVideo]);

  if (!video) {
    if (loadError) {
      const missing = /not found/i.test(loadError);
      return <NotFound title={missing ? 'Video not found' : "Couldn't load this video"} message={missing ? undefined : loadError} />;
    }
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/learn/videos');
  };

  const jump = (m: Chapter) => {
    setStart({ seconds: Math.max(0, Math.floor(m.startSeconds)), skillId: m.skillId, autoplay: true });
    playerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const watch = async () => {
    setWatchBusy(true);
    setWatchError(null);
    try {
      // Check-your-understanding flow: the first click loads the two quiz
      // questions and reveals the panel instead of recording the watch; the
      // next click submits the chosen answers and only a fully-correct set
      // records the watch.
      if (quiz && quizOpen) {
        if (answers.filter(Boolean).length < quiz.length) {
          setWatchBusy(false);
          return;
        }
        try {
          setOutcome(await markWatched(video.id, answers));
          setQuizResults(null);
          setQuizOpen(false);
        } catch (err) {
          const results = (err as { quizResults?: boolean[] }).quizResults;
          if (results) {
            setQuizResults(results);
            setWatchError('Not quite — review and try again.');
          } else {
            setWatchError(errorMessage(err));
          }
        }
        return;
      }
      // First click — load the quiz (cached server-side) and reveal the panel.
      const data = await getWatchQuiz(video.id);
      setQuiz(data.questions);
      setAnswers(new Array(data.questions.length).fill(''));
      setQuizResults(null);
      setQuizOpen(true);
      requestAnimationFrame(() => quizRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (err) {
      setWatchError(errorMessage(err));
    } finally {
      setWatchBusy(false);
    }
  };

  const chapters: Chapter[] = video.milestones
    .filter((m): m is Chapter => m.startSeconds !== null)
    .sort((a, b) => a.startSeconds - b.startSeconds);
  const activeChapter = chapters.find((m) => m.skillId === start.skillId) ?? null;

  const milestones = [...video.milestones].sort((a, b) => {
    if ((a.mastery === 'learned') !== (b.mastery === 'learned')) return a.mastery === 'learned' ? 1 : -1;
    return b.coverage - a.coverage;
  });
  const unlearned = video.unlearnedMilestones || milestones.filter((m) => m.mastery !== 'learned').length;
  const multi = unlearned >= 2;
  // www.youtube.com/embed rather than youtube-nocookie: nocookie serves blank
  // players to cookie-less contexts (YouTube bot-detection); the regular
  // domain embed worked historically (SourceViewer used it).
  // enablejsapi+origin allow posting commands (setPlaybackRate) into the
  // cross-origin player.
  const embedSrc = `https://www.youtube.com/embed/${encodeURIComponent(video.id)}?start=${start.seconds}${
    start.autoplay ? '&autoplay=1' : ''
  }&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
  const moved = outcome ? outcome.skills.filter((s) => s.previous !== s.mastery) : [];
  const transcript = video.transcriptExcerpt?.trim() ?? '';

  const chaptersList = (
    <div className="flex flex-col" style={{ gap: 2 }}>
      {chapters.map((m) => {
        const active = m.skillId === start.skillId;
        return (
          <button
            key={m.skillId}
            type="button"
            aria-pressed={active}
            onClick={() => jump(m)}
            className="flex w-full items-start text-left"
            style={{
              gap: 10,
              padding: '7px 10px',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${active ? 'color-mix(in srgb, var(--color-accent) 45%, transparent)' : 'transparent'}`,
              background: active ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'transparent',
              color: 'var(--color-text)',
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            <span className="font-semibold tabular-nums" style={{ fontSize: 12, color: 'var(--color-accent-700)', minWidth: 40 }}>
              {formatDuration(m.startSeconds)}
            </span>
            <span className="min-w-0" style={{ fontSize: 13, lineHeight: 1.35, opacity: m.mastery === 'learned' ? 0.55 : 1 }}>
              {m.label}
            </span>
          </button>
        );
      })}
    </div>
  );

  const playerBox = (
    <div
      style={{
        position: 'relative',
        aspectRatio: '16 / 9',
        width: '100%',
        maxWidth: '100%',
        background: '#000',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      {/* Unmounted while theatre mode shows its own fixed copy above — keeps
          the page from silently playing duplicate audio. */}
      {!theatreMode && (
        <iframe
          key={embedSrc}
          src={embedSrc}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
        />
      )}
      {speedHint !== null && (
        <div
          aria-live="polite"
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            zIndex: 5,
            padding: '4px 10px',
            borderRadius: 999,
            background: 'rgba(0,0,0,0.7)',
            color: '#fff',
            font: '600 13px var(--font-body)',
          }}
        >
          {speedHint}×
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6" style={{ maxWidth: 860 }}>
      {/* Breadcrumb */}
      <div>
        <button type="button" className="btn btn-ghost" onClick={goBack}>
          <HiArrowLeft className="h-4 w-4" />
          Videos
        </button>
      </div>

      {/* Header */}
      <div>
        <div className="card-kicker">
          {video.channel || 'YouTube'} · {formatDuration(video.durationSeconds)}
        </div>
        <h1 style={{ fontSize: 32, margin: 'var(--space-1) 0 var(--space-2)', lineHeight: 1.2 }}>{video.title}</h1>
        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          {multi && (
            <span
              className="inline-flex items-center gap-1 font-semibold"
              style={{ fontSize: 11, padding: '1px 8px', borderRadius: 999, color: 'var(--color-bg)', background: 'var(--color-accent)' }}
            >
              <HiOutlineSparkles className="h-3 w-3" />
              {unlearned} milestones in one
            </span>
          )}
          {video.coursesTouched > 1 && <Badge color="cyan">counts in {video.coursesTouched} courses</Badge>}
          {video.level && <Badge color="gray">{video.level}</Badge>}
          {video.watchedAt && <Badge color="green">Watched</Badge>}
          <span style={{ fontSize: 12.5, opacity: 0.55 }}>≈ {video.minutesPerMilestone} min per milestone</span>
        </div>
      </div>

      {/* Player + chapters */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile || chapters.length === 0 ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 260px',
          gap: 'var(--space-4)',
          alignItems: 'start',
        }}
      >
        <div ref={playerRef} className="min-w-0">
          {playerBox}
          {activeChapter && (
            <div className="flex flex-wrap items-center" style={{ gap: 10, marginTop: 8, fontSize: 13, opacity: 0.75 }} aria-live="polite">
              <HiOutlinePlay className="h-3.5 w-3.5" style={{ color: 'var(--color-accent)' }} />
              <span className="min-w-0 flex-1">
                {activeChapter.label} · from {formatDuration(activeChapter.startSeconds)}
              </span>
              <button
                type="button"
                className={`btn btn-ghost ${smallBtn}`}
                onClick={() => setStart({ seconds: 0, skillId: null, autoplay: false })}
              >
                Start over
              </button>
            </div>
          )}
        </div>

        {chapters.length > 0 && (
          <div className="min-w-0">
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <h3 className="section-label" style={{ margin: 0 }}>
                Chapters
              </h3>
              <button
                type="button"
                className={`btn btn-ghost ${smallBtn} flex items-center gap-1.5`}
                aria-pressed={theatreMode}
                onClick={() => setTheatreMode(!theatreMode)}
                title="Theatre mode — the video fills the viewport (Esc exits)"
              >
                {theatreMode ? <HiOutlineArrowsPointingIn className="h-4 w-4" /> : <HiOutlineArrowsPointingOut className="h-4 w-4" />}
                Theatre
              </button>
            </div>
            {chaptersList}
          </div>
        )}
      </div>

      {/* Theatre mode — fixed overlay, portaled to <body>, covering all page
          chrome. Local state; unmounting on exit also unmounts the theatre
          iframe, which returns the embed to 1× — the load handler re-applies
          the chosen rate. */}
      {theatreMode && (
        <TheatrePlayer embedSrc={embedSrc} title={video.title} onExit={() => setTheatreMode(false)} speedHint={speedHint}>
          {chapters.length > 0 ? (
            chaptersList
          ) : (
            <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>No chapters for this video.</p>
          )}
        </TheatrePlayer>
      )}

      {/* Actions */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-3)' }}>
          <button type="button" className="btn btn-primary" disabled={!!video.watchedAt || watchBusy} onClick={() => void watch()}>
            {video.watchedAt ? (
              <>
                <HiCheck className="h-4 w-4" />
                Watched ✓
              </>
            ) : watchBusy ? (
              quizOpen ? (
                'Checking…'
              ) : (
                'Loading questions…'
              )
            ) : quizOpen ? (
              'Submit answers'
            ) : (
              'Mark as watched'
            )}
          </button>
          <a className="btn btn-secondary" href={video.url} target="_blank" rel="noopener noreferrer">
            <HiOutlineArrowTopRightOnSquare className="h-4 w-4" />
            Open on YouTube
          </a>
          {video.watchedAt && !outcome && (
            <span style={{ fontSize: 13, opacity: 0.55 }}>Watched {fmtDate(video.watchedAt)}</span>
          )}
        </div>
        {quizOpen && !video.watchedAt && quiz && (
          <div ref={quizRef} className="card space-y-4" style={{ borderColor: 'color-mix(in srgb, var(--color-accent) 45%, transparent)' }}>
            <div>
              <div className="card-kicker" style={{ color: 'var(--color-accent)' }}>
                Check your understanding
              </div>
              <p style={{ fontSize: 13.5, opacity: 0.65, margin: '2px 0 0' }}>
                Answer both correctly to mark this video as watched.
              </p>
            </div>
            {quiz.map((q, qi) => (
              <div key={qi}>
                <p className="font-semibold" style={{ fontSize: 14.5, margin: '0 0 6px', lineHeight: 1.4 }}>
                  {qi + 1}. {q.question}
                </p>
                <div className="flex flex-col" style={{ gap: 6 }}>
                  {q.options.map((opt, oi) => {
                    const selected = answers[qi] === String(oi);
                    const wrong = quizResults?.[qi] === false && selected;
                    return (
                      <button
                        key={oi}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          setAnswers((a) => {
                            const next = [...a];
                            next[qi] = String(oi);
                            return next;
                          })
                        }
                        className="flex items-start text-left"
                        style={{
                          gap: 8,
                          padding: '8px 12px',
                          borderRadius: 'var(--radius-md)',
                          border: `1px solid ${
                            wrong
                              ? 'color-mix(in srgb, var(--color-danger) 55%, transparent)'
                              : selected
                                ? 'color-mix(in srgb, var(--color-accent) 55%, transparent)'
                                : 'var(--color-neutral-300)'
                          }`,
                          background: wrong
                            ? 'color-mix(in srgb, var(--color-danger) 8%, transparent)'
                            : selected
                              ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)'
                              : 'transparent',
                          color: 'var(--color-text)',
                          font: 'inherit',
                          fontSize: 13.5,
                          lineHeight: 1.45,
                          cursor: 'pointer',
                        }}
                      >
                        <span
                          className="font-semibold tabular-nums shrink-0"
                          style={{ fontSize: 12, color: selected ? 'var(--color-accent-700)' : 'inherit', opacity: selected ? 1 : 0.5 }}
                        >
                          {String.fromCharCode(65 + oi)}
                        </span>
                        <span className="min-w-0">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <p style={{ fontSize: 12.5, opacity: 0.5, margin: 0 }}>
              {answers.filter(Boolean).length} of {quiz.length} answered
              {quizResults && ' · red highlight = the answer you picked was wrong'}
            </p>
          </div>
        )}
        {outcome && (
          <Note tone="success">
            <HiCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>+{outcome.xpGained} XP</strong>
              {' · '}
              {moved.length > 0
                ? moved.map((s) => `${s.label} → ${MASTERY_LABEL[s.mastery]}`).join(' · ')
                : 'no milestone changed level yet — an assessed strategy will'}
            </span>
          </Note>
        )}
        {watchError && <Note tone="danger">{watchError}</Note>}
      </div>

      {/* Milestones */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between" style={{ gap: 8, marginBottom: 'var(--space-2)' }}>
          <h3 className="section-label" style={{ margin: 0 }}>
            Milestones in this video
          </h3>
          <span className="whitespace-nowrap" style={{ fontSize: 13, opacity: 0.5 }}>
            {plural(unlearned, 'unlearned')}
            {milestones.length - unlearned > 0 ? ` · ${milestones.length - unlearned} already learned` : ''}
          </span>
        </div>
        {milestones.length === 0 ? (
          <p style={{ fontSize: 14, opacity: 0.6, margin: 0 }}>This video has not been judged against any milestone yet.</p>
        ) : (
          <div className="flex flex-col">
            {milestones.map((m) => (
              <MilestoneRow
                key={m.skillId}
                m={m}
                active={m.skillId === start.skillId}
                onJump={m.startSeconds !== null ? () => jump(m as Chapter) : undefined}
                navigate={navigate}
              />
            ))}
          </div>
        )}
      </section>

      {/* Summary + captions */}
      {(video.summary || transcript) && (
        <section className="space-y-3">
          {video.summary && (
            <div>
              <h3 className="section-label" style={{ margin: '0 0 6px' }}>
                Summary
              </h3>
              <p style={{ fontSize: 15, lineHeight: 1.6, margin: 0 }}>{video.summary}</p>
            </div>
          )}
          {transcript && (
            <div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '4px 6px', fontSize: 13 }}
                aria-expanded={transcriptOpen}
                onClick={() => setTranscriptOpen((o) => !o)}
              >
                {transcriptOpen ? <HiChevronUp className="h-4 w-4" /> : <HiChevronDown className="h-4 w-4" />}
                What the captions say
              </button>
              {transcriptOpen && (
                <div
                  className="card"
                  style={{
                    marginTop: 8,
                    padding: 'var(--space-3) var(--space-4)',
                    fontSize: 13,
                    lineHeight: 1.6,
                    opacity: 0.8,
                    whiteSpace: 'pre-wrap',
                    maxHeight: 360,
                    overflowY: 'auto',
                  }}
                >
                  {transcript}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
