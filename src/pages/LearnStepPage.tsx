import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  HiArrowLeft,
  HiCheck,
  HiChevronDown,
  HiChevronLeft,
  HiChevronRight,
  HiChevronUp,
  HiOutlineArrowsRightLeft,
  HiOutlineClock,
  HiOutlineLockClosed,
} from 'react-icons/hi2';
import Spinner from '../components/shared/Spinner';
import Badge from '../components/shared/Badge';
import StrategyPicker from '../components/learn/StrategyPicker';
import ActivityOutcome, { MasteryBar, MasteryPill } from '../components/learn/ActivityOutcome';
import LessonRunner from '../components/learn/LessonRunner';
import QuizRunner from '../components/learn/QuizRunner';
import FlashcardRunner from '../components/learn/FlashcardRunner';
import DiscussionWorkspace from '../components/learn/DiscussionWorkspace';
import RecallRunner from '../components/learn/RecallRunner';
import PodcastRunner from '../components/learn/PodcastRunner';
import StepVideos from '../components/learn/StepVideos';
import { useLearningStore } from '../store/learningStore';
import {
  ACTIVITY_META,
  type ActivityKind,
  type LearningActivity,
  type SkillEvidence,
  type StepDetail,
  type SubmitResponse,
} from '../types/learning';

const KINDS = Object.keys(ACTIVITY_META) as ActivityKind[];
const parseKind = (v: string | null): ActivityKind | null =>
  v && (KINDS as string[]).includes(v) ? (v as ActivityKind) : null;

/** Leaving one of these mid-way loses typed answers — ask first. */
const CONFIRM_LEAVE: ReadonlySet<ActivityKind> = new Set<ActivityKind>(['quiz', 'discussion', 'recall']);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const evidenceLabel = (kind: SkillEvidence['kind']) =>
  kind === 'manual' ? 'Marked as known' : kind === 'video' ? 'Watched a video' : kind === 'podcast' ? 'Podcast listened' : ACTIVITY_META[kind].label;

/** Where the topic is worked on: `/learn/steps/:stepId` (optional `?start=<kind>`). */
export default function LearnStepPage() {
  const { stepId } = useParams<{ stepId: string }>();
  if (!stepId) return <NotFound />;
  // Keyed by step so navigating Prev/Next resets runner/outcome state and re-fetches.
  return <StepPage key={stepId} stepId={stepId} />;
}

function NotFound({ message }: { message?: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="mb-1" style={{ fontSize: 18 }}>
        Topic not found
      </p>
      <p className="mb-5 max-w-sm text-sm" style={{ opacity: 0.6 }}>
        {message ?? 'This roadmap step does not exist or has been removed.'}
      </p>
      <button type="button" className="btn btn-secondary" onClick={() => navigate('/learn')}>
        <HiArrowLeft className="h-4 w-4" />
        Back to Learn
      </button>
    </div>
  );
}

function Note({ tone, children }: { tone: 'warning' | 'success' | 'danger' | 'accent'; children: ReactNode }) {
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

function StepPage({ stepId }: { stepId: string }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const step = useLearningStore((s) => s.stepsById[stepId]);
  const loadStep = useLearningStore((s) => s.loadStep);
  const startActivity = useLearningStore((s) => s.startActivity);
  const abandonActivity = useLearningStore((s) => s.abandonActivity);
  const setSkillMastery = useLearningStore((s) => s.setSkillMastery);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [active, setActive] = useState<LearningActivity | null>(null);
  const [outcome, setOutcome] = useState<SubmitResponse | null>(null);
  const [busyKind, setBusyKind] = useState<ActivityKind | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [masteryBusy, setMasteryBusy] = useState(false);
  const [keyPointsOpen, setKeyPointsOpen] = useState(false);

  // `?start=<kind>` is consumed exactly once, after the step has loaded.
  const startKindRef = useRef<ActivityKind | null>(parseKind(searchParams.get('start')));
  const autoStartedRef = useRef(false);

  const pick = useCallback(
    async (detail: StepDetail, kind: ActivityKind) => {
      setPickError(null);
      setOutcome(null);
      const existing = detail.activities.find((a) => a.kind === kind && a.status === 'in_progress' && a.content);
      if (existing) {
        setActive(existing);
        return;
      }
      setBusyKind(kind);
      try {
        const activity = await startActivity(detail.id, kind);
        setActive(activity);
      } catch (err) {
        setPickError(err instanceof Error ? err.message : 'Could not start this activity');
      } finally {
        setBusyKind(null);
      }
    },
    [startActivity],
  );

  useEffect(() => {
    let cancelled = false;
    loadStep(stepId, true)
      .then((detail) => {
        if (cancelled) return;
        const kind = startKindRef.current;
        if (kind && !autoStartedRef.current) {
          autoStartedRef.current = true;
          navigate(`/learn/steps/${stepId}`, { replace: true });
          void pick(detail, kind);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load step');
      });
    return () => {
      cancelled = true;
    };
  }, [stepId, loadStep, navigate, pick]);

  if (!step) {
    if (loadError) return <NotFound message={loadError} />;
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const { skill } = step;
  const masteryPct = Math.round(skill.masteryScore * 100);
  const nextTarget = step.nextStepId ?? (step.roadmapNextStepId !== step.id ? step.roadmapNextStepId : null);

  const abandon = async () => {
    if (!active) return;
    const id = active.id;
    setActive(null);
    try {
      await abandonActivity(id);
    } catch {
      /* the next step reload reconciles the list */
    }
  };

  const backToStrategies = () => {
    if (!active) return;
    if (CONFIRM_LEAVE.has(active.kind) && !window.confirm('Leave this activity? Your answers so far will be lost.'))
      return;
    void abandon();
  };

  const markKnown = async () => {
    if (!window.confirm(`Mark "${step.title}" as learned? It will count as learned in every course that teaches it.`))
      return;
    setMasteryBusy(true);
    setPickError(null);
    try {
      await setSkillMastery(step.skillId, 'learned');
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'Could not update mastery');
    } finally {
      setMasteryBusy(false);
    }
  };

  const resetProgress = async () => {
    if (!window.confirm(`Reset your progress on "${step.title}"? Past activities stay in your history.`)) return;
    setMasteryBusy(true);
    setPickError(null);
    try {
      await setSkillMastery(step.skillId, 'not_started');
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'Could not reset progress');
    } finally {
      setMasteryBusy(false);
    }
  };

  const onComplete = (result: SubmitResponse) => {
    setOutcome(result);
    setActive(null);
  };

  const onNext = () => {
    if (nextTarget) navigate(`/learn/steps/${nextTarget}`);
    else navigate(`/courses/${step.courseId}`);
  };

  // "Talk it through" takes over the whole page as the two-pane workspace
  // (sketch 005): context rail left, tutor chat right, nothing else on screen.
  if (active?.kind === 'discussion') {
    return (
      <DiscussionWorkspace
        activity={active}
        step={step}
        onComplete={onComplete}
        onAbandon={() => void abandon()}
      />
    );
  }

  const evidence = [...step.evidence].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-6" style={{ maxWidth: 860 }}>
      {/* Breadcrumb / step navigation */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="btn btn-ghost min-w-0"
          onClick={() => navigate(`/courses/${step.courseId}`)}
          title={step.courseName}
        >
          <HiArrowLeft className="h-4 w-4 shrink-0" />
          <span className="truncate">{step.courseName}</span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!step.prevStepId}
            onClick={() => step.prevStepId && navigate(`/learn/steps/${step.prevStepId}`)}
            style={{ fontSize: 13 }}
          >
            <HiChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Prev topic</span>
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!step.nextStepId}
            onClick={() => step.nextStepId && navigate(`/learn/steps/${step.nextStepId}`)}
            style={{ fontSize: 13 }}
          >
            <span className="hidden sm:inline">Next topic</span>
            <HiChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="card-kicker">
            Step {step.position + 1} · {step.courseName}
          </div>
          {step.estimatedMinutes > 0 && (
            <span className="flex items-center gap-1 text-xs" style={{ opacity: 0.5 }}>
              <HiOutlineClock className="h-3.5 w-3.5" />≈ {step.estimatedMinutes} min
            </span>
          )}
        </div>
        <h1 style={{ fontSize: 32, margin: 'var(--space-1) 0 var(--space-2)' }}>{step.title}</h1>
        {step.description && (
          <p style={{ fontSize: 15, opacity: 0.6, margin: 0 }}>{step.description}</p>
        )}
      </div>

      {/* Mastery */}
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <MasteryPill mastery={skill.mastery} />
            <div className="flex min-w-[160px] flex-1 items-center gap-2" style={{ maxWidth: 280 }}>
              <span className="text-xs" style={{ opacity: 0.55 }}>
                Mastery
              </span>
              <MasteryBar score={skill.masteryScore} mastery={skill.mastery} />
              <span className="text-xs font-semibold" style={{ minWidth: 34, textAlign: 'right' }}>
                {masteryPct}%
              </span>
            </div>
          </div>
          {skill.mastery === 'learned' ? (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12 }}
              disabled={masteryBusy || !!active}
              onClick={resetProgress}
            >
              Reset progress
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12 }}
              disabled={masteryBusy || !!active}
              onClick={markKnown}
            >
              {masteryBusy ? 'Saving…' : 'I already know this'}
            </button>
          )}
        </div>

        {step.alsoIn.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
            <span className="inline-flex items-center gap-1" style={{ opacity: 0.6 }}>
              <HiOutlineArrowsRightLeft className="h-3.5 w-3.5" />
              Also taught in
            </span>
            {step.alsoIn.map((c) => (
              <button
                key={c.stepId}
                type="button"
                title={`Open this milestone in ${c.courseName}`}
                onClick={() => navigate(`/learn/steps/${c.stepId}`)}
                className="inline-flex max-w-full items-center gap-1 transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                style={{
                  fontSize: 11,
                  lineHeight: '16px',
                  padding: '1px 8px',
                  borderRadius: 999,
                  border: '1px solid var(--color-divider)',
                  cursor: 'pointer',
                }}
              >
                <span className="truncate">{c.courseName}</span>
                <span aria-hidden>→</span>
              </button>
            ))}
            <span style={{ opacity: 0.6 }}>Mastering it here completes it there too.</span>
          </div>
        )}

        {step.state === 'locked' && step.dependsOnTitles.length > 0 && (
          <Note tone="warning">
            <HiOutlineLockClosed className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Builds on: {step.dependsOnTitles.join(', ')} — you can start anyway.
            </span>
          </Note>
        )}

        {skill.mastery === 'learned' && (
          <Note tone="success">
            <HiCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Learned ✓{skill.learnedAt ? ` ${fmtDate(skill.learnedAt)}` : ''}
              <span style={{ opacity: 0.75 }}> · Review again any time — assessed strategies keep it fresh.</span>
            </span>
          </Note>
        )}
      </div>

      {/* Objectives & key points */}
      {(step.objectives.length > 0 || step.keyPoints.length > 0) && (
        <div className="space-y-4">
          {step.objectives.length > 0 && (
            <section className="space-y-2">
              <h3 className="section-label" style={{ margin: 0 }}>
                What you'll be able to do
              </h3>
              <ul className="space-y-1.5">
                {step.objectives.map((o, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <HiCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {step.keyPoints.length > 0 && (
            <section>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '4px 6px', fontSize: 13 }}
                aria-expanded={keyPointsOpen}
                onClick={() => setKeyPointsOpen((o) => !o)}
              >
                {keyPointsOpen ? <HiChevronUp className="h-4 w-4" /> : <HiChevronDown className="h-4 w-4" />}
                Key points ({step.keyPoints.length})
              </button>
              {keyPointsOpen && (
                <ul className="mt-2 ml-5 list-disc space-y-1.5 text-sm">
                  {step.keyPoints.map((k, i) => (
                    <li key={i} className="pl-1 leading-relaxed">
                      {k}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      {/* Work area: runner / outcome / picker */}
      {active ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" className="btn btn-ghost" onClick={backToStrategies}>
              <HiArrowLeft className="h-4 w-4" />
              Back to strategies
            </button>
            <span className="text-xs" style={{ opacity: 0.55 }}>
              {ACTIVITY_META[active.kind].emoji} {ACTIVITY_META[active.kind].label} · +{ACTIVITY_META[active.kind].xp}{' '}
              XP
            </span>
          </div>
          <Runner activity={active} step={step} onComplete={onComplete} onAbandon={() => void abandon()} />
        </div>
      ) : outcome ? (
        <ActivityOutcome
          result={outcome}
          step={step}
          onNext={onNext}
          onAgain={() => setOutcome(null)}
          onBack={() => navigate(`/courses/${step.courseId}`)}
        />
      ) : (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="section-label" style={{ margin: 0 }}>
              Choose a strategy
            </h3>
            <span className="text-xs" style={{ opacity: 0.55 }}>
              Every strategy earns XP · assessed ones move mastery
            </span>
          </div>
          {pickError && <Note tone="danger">{pickError}</Note>}
          <StrategyPicker step={step} busyKind={busyKind} onPick={(kind) => void pick(step, kind)} />
        </section>
      )}

      {/* Videos for this milestone (hidden while a runner has the floor) */}
      {!active && <StepVideos step={step} />}

      {/* History */}
      {!active && evidence.length > 0 && (
        <section className="space-y-3">
          <h3 className="section-label" style={{ margin: 0 }}>
            History
          </h3>
          <div className="flex flex-col">
            {evidence.map((e) => {
              const crossCourse = !!e.courseName && e.courseName !== step.courseName;
              return (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-3"
                  style={{ padding: '10px 0', borderTop: '1px solid var(--color-neutral-300)' }}
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm" style={{ margin: 0 }}>
                      <span className="font-semibold">{evidenceLabel(e.kind)}</span>
                      {crossCourse && <Badge color="cyan">via {e.courseName}</Badge>}
                    </p>
                    <p className="text-xs" style={{ opacity: 0.55, margin: 0 }}>
                      {fmtDate(e.createdAt)}
                      {e.note && ` · ${e.note}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold" style={{ color: 'var(--color-accent-700)' }}>
                    {Math.round(e.score * 100)}%
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Runner({
  activity,
  step,
  onComplete,
  onAbandon,
}: {
  activity: LearningActivity;
  step: StepDetail;
  onComplete: (result: SubmitResponse) => void;
  onAbandon: () => void;
}) {
  const props = { activity, step, onComplete, onAbandon };
  switch (activity.kind) {
    case 'lesson':
      return <LessonRunner key={activity.id} {...props} />;
    case 'quiz':
      return <QuizRunner key={activity.id} {...props} />;
    case 'flashcards':
      return <FlashcardRunner key={activity.id} {...props} />;
    case 'recall':
      return <RecallRunner key={activity.id} {...props} />;
    case 'podcast':
      return <PodcastRunner key={activity.id} {...props} />;
    default:
      return null;
  }
}
