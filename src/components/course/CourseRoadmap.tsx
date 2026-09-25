import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiCheck,
  HiChevronDown,
  HiChevronUp,
  HiLockClosed,
  HiOutlineArrowPath,
  HiOutlineArrowsRightLeft,
  HiOutlineClock,
  HiOutlineExclamationTriangle,
  HiOutlineMap,
  HiOutlinePlay,
  HiOutlineRocketLaunch,
  HiOutlineSparkles,
  HiOutlineTrophy,
  HiOutlineVideoCamera,
} from 'react-icons/hi2';
import { HiExternalLink } from 'react-icons/hi';
import Spinner from '../shared/Spinner';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useLearningStore } from '../../store/learningStore';
import type { Course } from '../../types/course';
import type { GenerationProgress } from '../../types/generation';
import {
  ACTIVITY_META,
  MASTERY_LABEL,
  type ActivityKind,
  type Roadmap,
  type RoadmapStep,
  type StepState,
} from '../../types/learning';

/** Diameter of a path node. */
const NODE = 44;
/** Height of the curved connector drawn between two rows. */
const CONNECTOR_H = 26;
/** Horizontal offsets that make the path meander like a trail. */
const ZIGZAG = [0, 28, 56, 28];
const ZIGZAG_MOBILE = [0, 12, 24, 12];
const OVERVIEW_CLAMP = 240;
const KINDS = Object.keys(ACTIVITY_META) as ActivityKind[];

const ACCENT_BORDER = 'color-mix(in srgb, var(--color-accent) 45%, transparent)';
const GHOST_BTN: CSSProperties = {
  padding: '4px 10px',
  fontSize: 12,
  border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
};

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** "A", "A and B", "A, B +2". */
const listNames = (names: string[]) =>
  names.length <= 2 ? names.join(' and ') : `${names[0]}, ${names[1]} +${names.length - 2}`;

/** Prose form: "A", "A and B", "A, B and C", "A, B, C and 2 others". */
const sentenceNames = (names: string[]) => {
  if (names.length <= 1) return names.join('');
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} others`;
};

function stageText(p: GenerationProgress | undefined): string {
  if (!p) return 'Building the roadmap…';
  switch (p.stage) {
    case 'collecting':
      return 'Reading materials…';
    case 'generating':
      return `Analysing material ${p.itemsGenerated + 1}…`;
    case 'synthesizing':
      return 'Laying out the path…';
    case 'done':
      return 'Almost there…';
    default:
      return 'Building the roadmap…';
  }
}

/** Rough completion for the generation bar; `materials` is a floor (chapters may split further). */
function stagePct(p: GenerationProgress | undefined, materials: number): number {
  if (!p) return 15;
  switch (p.stage) {
    case 'collecting':
      return 6;
    case 'generating':
      return Math.min(88, 12 + Math.round((p.itemsGenerated / Math.max(1, materials)) * 74));
    case 'synthesizing':
      return 92;
    case 'done':
      return 100;
    default:
      return 4;
  }
}

function ProgressBar({ pct, color = 'var(--color-accent)' }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 overflow-hidden" style={{ background: 'var(--color-neutral-200)', borderRadius: 999 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999, transition: 'width .4s ease' }} />
    </div>
  );
}

function ErrorBanner({ message, actionLabel, onAction }: { message: string; actionLabel: string; onAction: () => void }) {
  return (
    <div
      className="flex flex-wrap items-center gap-3"
      style={{
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
        color: 'var(--color-danger)',
        fontSize: 14,
      }}
    >
      <HiOutlineExclamationTriangle className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      <button
        className="btn btn-ghost"
        style={{ ...GHOST_BTN, color: 'var(--color-danger)', borderColor: 'color-mix(in srgb, var(--color-danger) 35%, transparent)' }}
        onClick={onAction}
      >
        <HiOutlineArrowPath className="h-3.5 w-3.5" />
        {actionLabel}
      </button>
    </div>
  );
}

function Pill({ color, title, children }: { color: string; title?: string; children: ReactNode }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 whitespace-nowrap"
      style={{
        fontSize: 11,
        lineHeight: '16px',
        padding: '1px 8px',
        borderRadius: 999,
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

/** Skill mastery — shared across courses, so it may already be "Learned" on a fresh path. */
function MasteryPill({ step }: { step: RoadmapStep }) {
  const { mastery, masteryScore } = step.skill;
  if (mastery === 'learning') {
    return (
      <Pill color="var(--color-accent)">
        {MASTERY_LABEL.learning} · {Math.round(masteryScore * 100)}%
      </Pill>
    );
  }
  if (mastery === 'learned') return <Pill color="var(--color-success)">{MASTERY_LABEL.learned}</Pill>;
  return null;
}

/**
 * Cross-course reuse: the same skill is taught elsewhere, so learning it here
 * counts there too. Clicking opens the other course's step; with several
 * courses a small menu lists one link per course. Clicks never reach the row
 * behind it, which has its own navigation.
 */
function SharedChip({ step }: { step: RoadmapStep }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const multi = step.alsoIn.length > 1;

  // Any click outside the chip closes the menu, and so does Escape while focus
  // is outside it. React stops native propagation at its root container, so
  // events from inside the chip never reach these document listeners — the
  // wrapper below handles Escape itself for the focused-inside case.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (step.alsoIn.length === 0) return null;
  const names = listNames(step.alsoIn.map((a) => a.courseName));
  const title =
    step.state === 'learned'
      ? `Learned here, so it already counts in ${names} — nothing to relearn.`
      : `The same skill is taught in ${names}. Learn it once and it counts there too.`;
  const go = (stepId: string) => {
    setOpen(false);
    navigate(`/learn/steps/${stepId}`);
  };

  return (
    <span
      className="relative inline-flex min-w-0 max-w-full"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        title={multi ? `${title} Pick a course to open its step.` : `${title} Open the step in ${names}.`}
        aria-haspopup={multi ? 'menu' : undefined}
        aria-expanded={multi ? open : undefined}
        onClick={() => (multi ? setOpen((o) => !o) : go(step.alsoIn[0].stepId))}
        className="inline-flex min-w-0 max-w-full items-center gap-1 transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] hover:opacity-100"
        style={{
          fontSize: 11,
          lineHeight: '16px',
          padding: '1px 8px',
          borderRadius: 999,
          border: '1px solid var(--color-divider)',
          opacity: open ? 1 : 0.8,
          cursor: 'pointer',
        }}
      >
        <HiOutlineArrowsRightLeft className="h-3 w-3 shrink-0" />
        <span className="truncate">Shared with {names}</span>
        {multi ? (
          open ? (
            <HiChevronUp className="h-3 w-3 shrink-0" />
          ) : (
            <HiChevronDown className="h-3 w-3 shrink-0" />
          )
        ) : (
          <span aria-hidden>→</span>
        )}
      </button>
      {multi && open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-10 mt-1 flex flex-col"
          style={{
            minWidth: 200,
            padding: 4,
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-divider)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <span className="section-label" style={{ margin: 0, padding: '4px 8px 2px', fontSize: 10 }}>
            Also taught in
          </span>
          {step.alsoIn.map((c) => (
            <button
              key={c.stepId}
              type="button"
              role="menuitem"
              onClick={() => go(c.stepId)}
              className="flex items-center justify-between gap-3 text-left text-xs transition-colors hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] hover:text-[var(--color-accent)]"
              style={{ padding: '6px 8px', borderRadius: 'var(--radius-sm)', whiteSpace: 'nowrap' }}
            >
              <span className="truncate">{c.courseName}</span>
              <span aria-hidden>→</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function PathNode({ state, index, offset }: { state: StepState; index: number; offset: number }) {
  const base: CSSProperties = {
    width: NODE,
    height: NODE,
    marginLeft: offset,
    borderRadius: '50%',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 'none',
    transition: 'scale .18s ease, box-shadow .18s ease',
  };
  const cls = 'group-hover:scale-105';
  switch (state) {
    case 'learned':
      return (
        <span className={cls} style={{ ...base, background: 'var(--color-success)', color: 'var(--color-bg)', boxShadow: 'var(--shadow-sm)' }}>
          <HiCheck className="h-5 w-5" />
        </span>
      );
    case 'current':
      return (
        <span
          className={cls}
          style={{
            ...base,
            background: 'var(--color-accent)',
            color: 'var(--color-bg)',
            boxShadow:
              '0 0 0 5px color-mix(in srgb, var(--color-accent) 22%, transparent), 0 0 22px color-mix(in srgb, var(--color-accent) 45%, transparent)',
          }}
        >
          <HiOutlineRocketLaunch className="h-5 w-5" />
        </span>
      );
    case 'available':
      return (
        <span className={cls} style={{ ...base, border: '2px solid var(--color-accent)', color: 'var(--color-accent)', fontSize: 14, fontWeight: 600 }}>
          {index}
        </span>
      );
    default:
      return (
        <span className={cls} style={{ ...base, border: '2px dashed var(--color-neutral-400)', color: 'var(--color-neutral-500)', opacity: 0.75 }}>
          <HiLockClosed className="h-4 w-4" />
        </span>
      );
  }
}

/** Curved track from one node's centre to the next, bridging the gap between rows. */
function Connector({ from, to, width, color, dashed }: { from: number; to: number; width: number; color: string; dashed: boolean }) {
  const h = CONNECTOR_H;
  return (
    <svg aria-hidden width={width} height={h} viewBox={`0 0 ${width} ${h}`} style={{ display: 'block', flex: 'none' }}>
      <path
        d={`M ${from} 0 C ${from} ${h * 0.6}, ${to} ${h * 0.4}, ${to} ${h}`}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={dashed ? '2 5' : undefined}
      />
    </svg>
  );
}

function StepRow({
  step,
  index,
  offset,
  nextOffset,
  nextState,
  colWidth,
  blockedBy,
  onOpen,
}: {
  step: RoadmapStep;
  index: number;
  offset: number;
  /** Offset of the following node, or null on the last row. */
  nextOffset: number | null;
  nextState: StepState | null;
  colWidth: number;
  /** Titles of the unmet prerequisites (locked steps only). */
  blockedBy: string[];
  onOpen: () => void;
}) {
  const cx = offset + NODE / 2;
  const travelled = step.state === 'learned';
  const lineColor = travelled ? 'color-mix(in srgb, var(--color-success) 70%, transparent)' : 'var(--color-neutral-400)';
  const dashed = nextState === 'locked';
  const isCurrent = step.state === 'current';
  const isLocked = step.state === 'locked';
  const completed = step.activities.filter((a) => a.status === 'completed').length;

  return (
    <div>
      {/* A div, not a <button>: the SharedChip inside is itself a button, and buttons cannot nest. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (isLocked) return; // ponytail: UI gate only; deep links/Next-topic still resolve
          onOpen();
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return; // the chip handles its own keys
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (isLocked) return;
            onOpen();
          }
        }}
        className="group flex w-full items-stretch gap-3 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
        style={{ borderRadius: 'var(--radius-md)', paddingRight: 8, cursor: isLocked ? 'default' : 'pointer' }}
      >
        <div className="relative shrink-0" style={{ width: colWidth }}>
          {nextOffset !== null && (
            <span
              aria-hidden
              style={{ position: 'absolute', left: cx - 1, top: NODE, bottom: 0, width: 0, borderLeft: `2px ${dashed ? 'dashed' : 'solid'} ${lineColor}` }}
            />
          )}
          <PathNode state={step.state} index={index + 1} offset={offset} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center" style={{ minHeight: NODE }}>
          <p
            className={`text-sm leading-snug ${isCurrent ? 'font-semibold text-[var(--color-accent)]' : ''}`}
            style={{ margin: 0, opacity: step.state === 'learned' ? 0.55 : isLocked ? 0.6 : 1 }}
          >
            {step.title}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1 whitespace-nowrap" style={{ opacity: 0.55 }}>
              <HiOutlineClock className="h-3 w-3" />≈ {step.estimatedMinutes} min
            </span>
            <MasteryPill step={step} />
            {completed > 0 && (
              <span style={{ opacity: 0.55 }}>{completed === 1 ? '1 activity' : `${completed} activities`}</span>
            )}
            <SharedChip step={step} />
            {isLocked && blockedBy.length > 0 && (
              <span className="inline-flex min-w-0 items-center gap-1" style={{ opacity: 0.55 }}>
                <HiLockClosed className="h-3 w-3 shrink-0" />
                <span className="truncate">after {listNames(blockedBy)}</span>
              </span>
            )}
          </div>
        </div>
      </div>
      {nextOffset !== null && <Connector from={cx} to={nextOffset + NODE / 2} width={colWidth} color={lineColor} dashed={dashed} />}
    </div>
  );
}

/**
 * Course roadmap — the server-built learning path: an up-next hero and a
 *  Duolingo-style trail of steps, each pointing at a skill shared across courses.
 *  Also renders the merged "All courses" view (`isMerged` + a prebuilt `roadmap`
 *  from mergeRoadmaps) — in that mode the per-course actions are hidden.
 */
export default function CourseRoadmap({
  course,
  isMerged = false,
  roadmap: provided,
}: {
  course: Course;
  /** Merged "All courses" mode: `roadmap` is prebuilt, per-course actions hidden. */
  isMerged?: boolean;
  /** Prebuilt roadmap (merged mode); otherwise loaded from the store. */
  roadmap?: Roadmap;
}) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const cached = useLearningStore((s) => s.roadmapsByCourseId[course.id]);
  const roadmap: Roadmap | null | undefined = provided ?? cached;
  const progress: GenerationProgress | undefined = useLearningStore((s) => s.generation[course.id]);
  const loadRoadmap = useLearningStore((s) => s.loadRoadmap);
  const generateRoadmap = useLearningStore((s) => s.generateRoadmap);
  const [loadError, setLoadError] = useState<{ courseId: string; message: string } | null>(null);
  const [actionError, setActionError] = useState<{ courseId: string; message: string } | null>(null);
  const [overviewOpen, setOverviewOpen] = useState(false);

  useEffect(() => {
    if (isMerged) return; // merged view is prebuilt by the caller
    let cancelled = false;
    loadRoadmap(course.id).catch((err: unknown) => {
      if (!cancelled) setLoadError({ courseId: course.id, message: errorMessage(err) });
    });
    return () => {
      cancelled = true;
    };
  }, [course.id, loadRoadmap, isMerged]);

  // A roadmap generating elsewhere (another tab, a reload mid-stream) has no
  // local progress to follow; poll until the server reports it finished.
  const polling = roadmap?.status === 'generating' && !progress;
  useEffect(() => {
    if (!polling) return;
    const id = window.setInterval(() => {
      loadRoadmap(course.id, true).catch(() => {});
    }, 3000);
    return () => window.clearInterval(id);
  }, [polling, course.id, loadRoadmap]);

  const retryLoad = () => {
    setLoadError(null);
    loadRoadmap(course.id, true).catch((err: unknown) => setLoadError({ courseId: course.id, message: errorMessage(err) }));
  };

  const generate = async () => {
    setActionError(null);
    try {
      await generateRoadmap(course.id);
    } catch (err) {
      setActionError({ courseId: course.id, message: errorMessage(err) });
    }
  };

  const regenerate = () => {
    const ok = window.confirm(
      `Rebuild the learning path for ${course.name}?\n\nInkwell will re-read the materials and lay the topics out again. Your progress is safe — mastery lives on skills, not on the path, and topics you've already mastered won't be taught again.`,
    );
    if (ok) void generate();
  };

  const openStep = (id: string) => navigate(`/learn/steps/${id}`);
  const noMaterials = course.documentIds.length === 0;
  const generating = (!!progress && progress.stage !== 'error') || polling;
  const genError =
    progress?.stage === 'error'
      ? progress.error || 'Roadmap generation failed'
      : actionError?.courseId === course.id
        ? actionError.message
        : null;

  const courseraLine = course.courseraSlug ? (
    <p className="text-xs" style={{ opacity: 0.45 }}>
      <a
        href={`https://www.coursera.org/learn/${course.courseraSlug}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-0.5 transition-colors hover:text-[var(--color-accent)]"
      >
        Course on Coursera <HiExternalLink className="inline h-3 w-3" />
      </a>
    </p>
  ) : null;

  let body: ReactNode;

  if (roadmap === undefined) {
    body =
      loadError?.courseId === course.id ? (
        <ErrorBanner message={loadError.message} actionLabel="Retry" onAction={retryLoad} />
      ) : (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      );
  } else if (generating) {
    body = (
      <div className="card p-5" style={{ borderColor: ACCENT_BORDER }}>
        <div className="flex items-center gap-2" style={{ color: 'var(--color-accent)' }}>
          <Spinner size="sm" />
          <span className="text-xs font-semibold uppercase tracking-widest">Building your roadmap</span>
        </div>
        <h3 className="mt-1.5 text-lg font-semibold leading-snug">{stageText(progress)}</h3>
        <p className="mt-1 text-sm" style={{ opacity: 0.6 }}>
          Inkwell is reading every material in {course.name} and laying the topics out in the order to learn them. This usually takes a minute or two.
        </p>
        <div className="mt-4">
          <ProgressBar pct={stagePct(progress, course.documentIds.length)} />
        </div>
        {progress && progress.itemsGenerated > 0 && (
          <p className="mt-2 text-xs" style={{ opacity: 0.5 }}>
            {progress.itemsGenerated === 1 ? '1 material analysed' : `${progress.itemsGenerated} materials analysed`}
          </p>
        )}
      </div>
    );
  } else if (!roadmap || roadmap.status !== 'done') {
    // No roadmap yet — or a stale pending / failed one. Same card, different verb.
    const failed = roadmap?.status === 'error';
    const error = genError ?? (failed ? roadmap.error || 'Roadmap generation failed' : null);
    body = (
      <div className="card p-5" style={{ borderColor: ACCENT_BORDER }}>
        <div className="card-kicker">Learning path</div>
        <h3 className="mt-1.5 text-xl font-semibold leading-snug">Build a roadmap for {course.name}</h3>
        <p className="mt-1 text-sm" style={{ opacity: 0.65 }}>
          Inkwell reads every material in the course and lays the topics out in the order to learn them — each one a skill you can master with a lesson, flashcards, a quiz, teaching it back or talking it through.
        </p>
        {error && (
          <div className="mt-3">
            <ErrorBanner message={error} actionLabel="Try again" onAction={generate} />
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" onClick={generate} disabled={noMaterials}>
            <HiOutlineSparkles className="h-4 w-4" />
            {error ? 'Try again' : 'Build my roadmap'}
          </button>
          {noMaterials && (
            <span className="text-xs" style={{ opacity: 0.55 }}>
              Add materials to this course first
            </span>
          )}
        </div>
      </div>
    );
  } else {
    const steps = roadmap.steps;
    const total = roadmap.counts.total || steps.length;
    const learned = roadmap.counts.learned;
    const pct = total ? Math.round((learned / total) * 100) : 0;
    const complete = total > 0 && learned >= total;
    const minutesLeft = steps
      .filter((s) => s.state !== 'learned')
      .reduce((sum, s) => sum + s.estimatedMinutes, 0);
    const current = steps.find((s) => s.id === roadmap.nextStepId) ?? steps.find((s) => s.state === 'current') ?? null;
    const overview = roadmap.overview.trim();
    const clamped = overview.length > OVERVIEW_CLAMP;
    const zig = isMobile ? ZIGZAG_MOBILE : ZIGZAG;
    const colWidth = NODE + Math.max(...zig);
    const sharedCount = steps.filter((s) => s.alsoIn.length > 0).length;
    const sharedCourses = [...new Set(steps.flatMap((s) => s.alsoIn.map((a) => a.courseName)))];
    const blockedBy = (step: RoadmapStep) => {
      const deps = step.dependsOn.map((id) => steps.find((s) => s.id === id)).filter((s): s is RoadmapStep => !!s);
      const unmet = deps.filter((s) => s.state !== 'learned');
      return (unmet.length ? unmet : deps).map((s) => s.title);
    };

    const hero = complete ? (
      <div className="card p-5" style={{ borderColor: 'color-mix(in srgb, var(--color-success) 45%, transparent)' }}>
        <div className="flex items-center gap-2" style={{ color: 'var(--color-success)' }}>
          <HiOutlineTrophy className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-widest">Course complete</span>
        </div>
        <h3 className="mt-1.5 text-xl font-semibold leading-snug">You've learned every topic in {course.name}</h3>
        <p className="mt-1 text-sm" style={{ opacity: 0.65 }}>
          All {total} skills are marked learned — and they count in every other course that teaches them. Mastery fades without practice, so drop back in for a review now and then.
        </p>
        <div className={`mt-4 flex gap-2 ${isMobile ? 'flex-col' : 'flex-wrap items-center'}`}>
          {steps[0] && (
            <button className="btn btn-secondary" onClick={() => openStep(steps[0].id)}>
              <HiOutlineArrowPath className="h-4 w-4" />
              Review a topic
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => navigate('/learn')}>
            Learning overview
          </button>
        </div>
      </div>
    ) : current ? (
      <div className="card p-5" style={{ borderColor: ACCENT_BORDER }}>
        <div className="flex items-center gap-2" style={{ color: 'var(--color-accent)' }}>
          <HiOutlineRocketLaunch className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-widest">Up next</span>
        </div>
        <h3 className="mt-1.5 text-xl font-semibold leading-snug">{current.title}</h3>
        {current.description && (
          <p className="mt-1 text-sm" style={{ opacity: 0.65 }}>
            {current.description}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1 whitespace-nowrap" style={{ opacity: 0.6 }}>
            <HiOutlineClock className="h-3.5 w-3.5" />≈ {current.estimatedMinutes} min
          </span>
          <span style={{ opacity: 0.6 }}>
            {current.objectives.length === 1 ? '1 objective' : `${current.objectives.length} objectives`}
          </span>
          <MasteryPill step={current} />
          <SharedChip step={current} />
        </div>
        <div className={`mt-4 flex gap-2 ${isMobile ? 'flex-col' : 'flex-wrap items-center'}`}>
          <button className="btn btn-primary" onClick={() => openStep(current.id)}>
            <HiOutlinePlay className="h-4 w-4" />
            Start learning
          </button>
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((kind) => {
              const meta = ACTIVITY_META[kind];
              return (
                <button
                  key={kind}
                  title={`${meta.blurb} · +${meta.xp} XP`}
                  onClick={() => navigate(`/learn/steps/${current.id}?start=${kind}`)}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--color-divider)] px-2.5 py-1 text-xs transition-colors hover:border-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] hover:text-[var(--color-accent)]"
                >
                  <span aria-hidden>{meta.emoji}</span>
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    ) : null;

    body = (
      <>
        {genError && <ErrorBanner message={genError} actionLabel="Retry" onAction={generate} />}

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex items-center gap-3">
            <span className="section-label">Roadmap</span>
            <span className="text-xs" style={{ opacity: 0.55 }}>
              {learned}/{total} learned · {pct}%{minutesLeft > 0 && <> · ≈ {minutesLeft} min left</>}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {!isMerged && (
              <button
                className="btn btn-ghost"
                style={GHOST_BTN}
                onClick={() => navigate(`/learn/videos?courseId=${encodeURIComponent(course.id)}`)}
                title="YouTube videos judged against this course's milestones"
              >
                <HiOutlineVideoCamera className="h-3.5 w-3.5" />
                Videos
              </button>
            )}
            <button className="btn btn-ghost" style={GHOST_BTN} onClick={() => navigate('/topic-map')}>
              <HiOutlineMap className="h-3.5 w-3.5" />
              Topic map
            </button>
            {!isMerged && (
              <button
                className="btn btn-ghost"
                style={GHOST_BTN}
                onClick={regenerate}
                title="Rebuild the path from the course materials. Mastery is kept — it lives on skills, and topics you've already mastered are left out."
              >
                <HiOutlineArrowPath className="h-3.5 w-3.5" />
                Regenerate
              </button>
            )}
          </div>
        </div>

        {sharedCount > 0 && (
          <p className="flex items-start gap-1.5 text-xs" style={{ margin: 0, opacity: 0.7 }}>
            <HiOutlineArrowsRightLeft className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-accent)' }} />
            <span>
              <span className="font-semibold">Cross-course</span> · {sharedCount} of {total} milestone{total === 1 ? '' : 's'}{' '}
              {sharedCount === 1 ? 'is' : 'are'} also taught in {sentenceNames(sharedCourses)} —{' '}
              {sharedCount === 1 ? "learn it here and it's done there too." : "learn them here and they're done there too."}
            </span>
          </p>
        )}

        {overview && (
          <p className="text-sm" style={{ margin: 0, opacity: 0.65 }}>
            {clamped && !overviewOpen ? `${overview.slice(0, OVERVIEW_CLAMP).trimEnd()}…` : overview}
            {clamped && (
              <button
                className="ml-1.5 text-xs transition-opacity hover:opacity-100"
                style={{ color: 'var(--color-accent)', opacity: 0.85 }}
                onClick={() => setOverviewOpen((v) => !v)}
              >
                {overviewOpen ? 'Less' : 'More'}
              </button>
            )}
          </p>
        )}

        <ProgressBar pct={pct} color={complete ? 'var(--color-success)' : 'var(--color-accent)'} />

        {hero}

        {steps.length === 0 ? (
          <p className="text-sm" style={{ opacity: 0.55 }}>
            Inkwell couldn't find teachable topics in these materials. Add more to the course, then regenerate the path.
          </p>
        ) : (
          <div>
            {steps.map((step, i) => (
              <StepRow
                key={step.id}
                step={step}
                index={i}
                offset={zig[i % zig.length]}
                nextOffset={i + 1 < steps.length ? zig[(i + 1) % zig.length] : null}
                nextState={steps[i + 1]?.state ?? null}
                colWidth={colWidth}
                blockedBy={step.state === 'locked' ? blockedBy(step) : []}
                onOpen={() => openStep(step.id)}
              />
            ))}
          </div>
        )}

        <p className="text-xs" style={{ opacity: 0.45 }}>
          Each step is a skill shared across your courses — learn it once and it counts everywhere.
        </p>
      </>
    );
  }

  return (
    <div className="space-y-4">
      {body}
      {courseraLine}
    </div>
  );
}
