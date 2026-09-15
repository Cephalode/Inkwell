import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { PiRocketLaunchDuotone } from 'react-icons/pi';
import { HiOutlineRocketLaunch, HiOutlinePlay, HiOutlineSparkles, HiChevronDown, HiChevronRight } from 'react-icons/hi2';
import Badge from '../components/shared/Badge';
import EmptyState from '../components/shared/EmptyState';
import Spinner from '../components/shared/Spinner';
import { useIsMobile } from '../hooks/useIsMobile';
import { useLearningStore } from '../store/learningStore';
import { useVideoStore } from '../store/videoStore';
import { MASTERY_LABEL, type CourseProgress, type Mastery, type SkillWithCourses } from '../types/learning';
import { videoValueLine, type PlanMilestone, type RankedVideo, type VideoSearchStatus } from '../types/videos';

const DAY_MS = 86_400_000;
const GROUP_CAP = 8;
const SHARED_CAP = 6;
const GROUP_ORDER: Mastery[] = ['learned', 'learning', 'not_started'];

const MASTERY_COLOR: Record<Mastery, string> = {
  learned: 'var(--color-success)',
  learning: 'var(--color-accent)',
  not_started: 'var(--color-neutral-500)',
};

type Navigate = (to: string) => void;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function learnedAgo(iso: string | null): string {
  if (!iso) return 'learned';
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS));
  if (days === 0) return 'learned today';
  if (days === 1) return 'learned yesterday';
  return `learned ${days} days ago`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const rowStyle: CSSProperties = { padding: '12px 0', borderTop: '1px solid var(--color-neutral-300)' };

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

/** Thin horizontal meter; segments stack left → right. */
function Meter({ segments, height = 6 }: { segments: Array<{ fraction: number; color: string }>; height?: number }) {
  return (
    <div aria-hidden className="flex overflow-hidden" style={{ height, borderRadius: 999, background: 'var(--color-neutral-300)' }}>
      {segments.map((s, i) => (
        <div
          key={i}
          style={{ width: `${Math.max(0, Math.min(1, s.fraction)) * 100}%`, background: s.color, transition: 'width .3s', flex: 'none' }}
        />
      ))}
    </div>
  );
}

function StatTile({
  value,
  label,
  labelColor,
  sub,
  children,
}: {
  value: ReactNode;
  label: string;
  /** Overrides the muted label colour (e.g. success once the daily goal is hit). */
  labelColor?: string;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="card min-w-0" style={{ padding: 'var(--space-3) var(--space-4)' }}>
      <div className="font-semibold" style={{ fontSize: 24, lineHeight: 1.15 }}>
        {value}
      </div>
      <div style={{ fontSize: 12.5, marginTop: 2, ...(labelColor ? { color: labelColor } : { opacity: 0.6 }) }}>{label}</div>
      {sub && <div style={{ fontSize: 12, opacity: 0.5, marginTop: 2 }}>{sub}</div>}
      {children}
    </div>
  );
}

function SectionHeader({ label, aside }: { label: string; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between" style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
      <div className="section-label">{label}</div>
      {aside}
    </div>
  );
}

function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      className="flex flex-wrap items-center"
      style={{
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)',
        background: 'color-mix(in srgb, var(--color-danger) 8%, transparent)',
        color: 'var(--color-danger)',
        fontSize: 14,
      }}
    >
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry && (
        <button type="button" className={`btn btn-secondary ${smallBtn}`} style={{ color: 'var(--color-text)' }} onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

function Hero({ kicker, title, blurb, children }: { kicker: string; title: string; blurb?: string; children?: ReactNode }) {
  return (
    <div
      className="card"
      style={{
        padding: 'var(--space-5)',
        borderColor: 'color-mix(in srgb, var(--color-accent) 45%, transparent)',
        marginBottom: 'var(--space-8)',
      }}
    >
      <div className="flex items-center gap-2" style={{ color: 'var(--color-accent)' }}>
        <HiOutlineRocketLaunch className="h-4 w-4" />
        <span className="card-kicker">{kicker}</span>
      </div>
      <h2 style={{ fontSize: 22, margin: 'var(--space-2) 0 var(--space-1)', lineHeight: 1.25 }}>{title}</h2>
      {blurb && <div style={{ fontSize: 14, opacity: 0.6 }}>{blurb}</div>}
      {children && (
        <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function CourseRow({ course: c, navigate }: { course: CourseProgress; navigate: Navigate }) {
  const next = c.nextStep;
  const hasRoadmap = !!c.roadmapId && c.status !== null;
  const building = c.status === 'generating' || c.status === 'pending';
  const failed = c.status === 'error';
  const done = c.status === 'done';
  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <div onClick={() => navigate(`/courses/${c.courseId}`)} className="cursor-pointer" style={rowStyle}>
      <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2) var(--space-3)' }}>
        <span className="min-w-0 flex-1 font-semibold" style={{ fontSize: 15 }}>
          {c.courseName}
        </span>
        {!hasRoadmap && (
          <>
            <Badge color="gray">No roadmap yet</Badge>
            <button
              type="button"
              className={`btn btn-secondary ${smallBtn}`}
              onClick={(e) => {
                stop(e);
                navigate(`/courses/${c.courseId}`);
              }}
            >
              Build
            </button>
          </>
        )}
        {building && <Badge color="yellow">Building…</Badge>}
        {failed && <Badge color="red">Failed</Badge>}
        {done && (
          <span className="whitespace-nowrap" style={{ fontSize: 13, opacity: 0.6 }}>
            {c.learned}/{c.total} learned{c.learning > 0 ? ` · ${c.learning} in progress` : ''}
          </span>
        )}
        {hasRoadmap && (
          <button
            type="button"
            className={`btn btn-ghost ${smallBtn}`}
            title="Videos judged against this course's milestones"
            onClick={(e) => {
              stop(e);
              navigate(`/learn/videos?courseId=${encodeURIComponent(c.courseId)}`);
            }}
          >
            <HiOutlinePlay className="h-3.5 w-3.5" /> Videos
          </button>
        )}
      </div>

      {done && c.total > 0 && (
        <div style={{ marginTop: 8 }}>
          <Meter
            segments={[
              { fraction: c.learned / c.total, color: MASTERY_COLOR.learned },
              { fraction: c.learning / c.total, color: MASTERY_COLOR.learning },
            ]}
          />
        </div>
      )}

      {next ? (
        <div className="flex items-center" style={{ gap: 'var(--space-3)', marginTop: 8, fontSize: 14 }}>
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
            <span style={{ opacity: 0.5 }}>Next:</span> {next.title}{' '}
            <span style={{ opacity: 0.5, fontSize: 13 }}>≈ {next.estimatedMinutes} min</span>
          </span>
          <button
            type="button"
            className={`btn btn-primary ${smallBtn}`}
            onClick={(e) => {
              stop(e);
              navigate(`/learn/steps/${next.id}`);
            }}
          >
            Go
          </button>
        </div>
      ) : (
        done &&
        c.total > 0 && (
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--color-success)' }}>All {plural(c.total, 'step')} learned ✓</div>
        )
      )}
    </div>
  );
}

function SkillRow({ skill: s, navigate, isMobile }: { skill: SkillWithCourses; navigate: Navigate; isMobile: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, s.masteryScore)) * 100);
  return (
    <div
      style={{
        ...rowStyle,
        padding: '10px 0',
        display: 'grid',
        gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 160px',
        gap: isMobile ? 6 : 'var(--space-4)',
        alignItems: 'center',
      }}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline" style={{ gap: 8 }}>
          <span className="font-semibold" style={{ fontSize: 15 }}>
            {s.label}
          </span>
          {s.courses.length > 1 && <span style={{ fontSize: 12, opacity: 0.5 }}>shared by {s.courses.length} courses</span>}
        </div>
        {s.description && (
          <div className="overflow-hidden text-ellipsis whitespace-nowrap" style={{ fontSize: 13, opacity: 0.55, marginTop: 2 }}>
            {s.description}
          </div>
        )}
        {s.courses.length > 0 && (
          <div className="flex flex-wrap" style={{ gap: 6, marginTop: 6 }}>
            {s.courses.map((c) => (
              <button
                key={c.stepId}
                type="button"
                style={chipStyle}
                title={`Open in ${c.courseName}`}
                onClick={() => navigate(`/learn/steps/${c.stepId}`)}
              >
                {c.courseName}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center" style={{ gap: 10 }}>
        <div className="flex-1">
          <Meter segments={[{ fraction: s.masteryScore, color: MASTERY_COLOR[s.mastery] }]} height={5} />
        </div>
        <span className="whitespace-nowrap text-right" style={{ fontSize: 12.5, opacity: 0.6, minWidth: 34 }}>
          {pct}%
        </span>
      </div>
    </div>
  );
}

/** A milestone taught by ≥ 2 courses: where it is taught, how far along it is,
 *  and the quickest video for it (or a button to go find one). */
function SharedSkillRow({
  skill: s,
  milestone,
  best,
  searching,
  error,
  navigate,
  onFind,
  isMobile,
}: {
  skill: SkillWithCourses;
  /** What the video plan knows about this skill (undefined until the plan loads). */
  milestone: PlanMilestone | undefined;
  /** The plan's best-value video for this skill (the RankedVideo behind `milestone.bestVideoId`). */
  best: RankedVideo | undefined;
  searching: boolean;
  error: string | undefined;
  navigate: Navigate;
  onFind: (skillId: string, force: boolean) => void;
  isMobile: boolean;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, s.masteryScore)) * 100);
  const bestVideoId = milestone?.bestVideoId ?? null;
  // Local state wins: a search this page started, or one that just failed, must not be masked by a
  // plan snapshot taken while another skill's search was still in flight (it would say 'searching').
  const status: VideoSearchStatus = searching ? 'searching' : error ? 'error' : (milestone?.searchStatus ?? 'none');
  const multi = !!best && best.unlearnedMilestones >= 2;
  const valueParts: string[] = [];
  if (best) valueParts.push(videoValueLine(best), `≈ ${best.minutesPerMilestone} min per milestone`);
  if (milestone && milestone.videoCount > 1) valueParts.push(`${plural(milestone.videoCount, 'video')} judged`);
  const findLabel = status === 'error' ? 'Retry search' : status === 'done' ? 'No video yet · Search again' : 'Find videos';
  return (
    <div
      style={{
        ...rowStyle,
        padding: '10px 0',
        display: 'grid',
        gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 160px',
        gap: isMobile ? 6 : 'var(--space-4)',
        alignItems: 'center',
      }}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline" style={{ gap: 8 }}>
          <span className="font-semibold" style={{ fontSize: 15 }}>
            {s.label}
          </span>
          <span style={{ fontSize: 12, opacity: 0.5 }}>Shared by {s.courses.length} courses</span>
          <span style={{ fontSize: 12, color: MASTERY_COLOR[s.mastery] }}>{MASTERY_LABEL[s.mastery]}</span>
        </div>
        <div className="flex flex-wrap" style={{ gap: 6, marginTop: 6 }}>
          {s.courses.map((c) => (
            <button
              key={c.stepId}
              type="button"
              style={chipStyle}
              title={`Open this milestone in ${c.courseName}`}
              onClick={() => navigate(`/learn/steps/${c.stepId}`)}
            >
              {c.courseName}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2) var(--space-3)', marginTop: 8 }}>
          {bestVideoId ? (
            <>
              <button
                type="button"
                className={`btn btn-secondary ${smallBtn}`}
                title={best?.title}
                onClick={() => navigate(`/learn/videos/${bestVideoId}`)}
              >
                <HiOutlinePlay className="h-3.5 w-3.5" style={{ color: 'var(--color-accent)' }} /> Best video
              </button>
              {multi && best && (
                <span
                  className="inline-flex items-center gap-1 font-semibold"
                  style={{ fontSize: 11, padding: '1px 8px', borderRadius: 999, color: 'var(--color-bg)', background: 'var(--color-accent)' }}
                >
                  <HiOutlineSparkles className="h-3 w-3" />
                  {best.unlearnedMilestones} milestones in one
                </span>
              )}
              {valueParts.length > 0 && <span style={{ fontSize: 12.5, opacity: 0.55 }}>{valueParts.join(' · ')}</span>}
            </>
          ) : status === 'searching' ? (
            <span className="inline-flex items-center" style={{ gap: 8, fontSize: 13, opacity: 0.65 }}>
              <Spinner size="sm" />
              Searching YouTube, reading captions, judging…
            </span>
          ) : (
            <button type="button" className={`btn btn-ghost ${smallBtn}`} onClick={() => onFind(s.id, status !== 'none')}>
              {findLabel}
            </button>
          )}
          {error && status !== 'searching' && <span style={{ fontSize: 12.5, color: 'var(--color-danger)' }}>{error}</span>}
        </div>
      </div>
      <div className="flex items-center" style={{ gap: 10 }}>
        <div className="flex-1">
          <Meter segments={[{ fraction: s.masteryScore, color: MASTERY_COLOR[s.mastery] }]} height={5} />
        </div>
        <span className="whitespace-nowrap text-right" style={{ fontSize: 12.5, opacity: 0.6, minWidth: 34 }}>
          {pct}%
        </span>
      </div>
    </div>
  );
}

function SkillGroup({
  mastery,
  items,
  open,
  showAll,
  onToggle,
  onShowAll,
  navigate,
  isMobile,
}: {
  mastery: Mastery;
  items: SkillWithCourses[];
  open: boolean;
  showAll: boolean;
  onToggle: () => void;
  onShowAll: () => void;
  navigate: Navigate;
  isMobile: boolean;
}) {
  if (items.length === 0) return null;
  const visible = showAll ? items : items.slice(0, GROUP_CAP);
  const Chevron = open ? HiChevronDown : HiChevronRight;
  return (
    <div style={{ marginTop: 'var(--space-3)' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center text-left"
        style={{ gap: 8, padding: '8px 0', background: 'transparent', border: 'none', color: 'var(--color-text)', font: 'inherit' }}
      >
        <Chevron className="h-4 w-4" style={{ opacity: 0.6, flex: 'none' }} />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: MASTERY_COLOR[mastery], flex: 'none' }} />
        <span className="font-semibold" style={{ fontSize: 14 }}>
          {MASTERY_LABEL[mastery]}
        </span>
        <span style={{ fontSize: 13, opacity: 0.5 }}>{items.length}</span>
      </button>
      {open && (
        <div className="flex flex-col">
          {visible.map((s) => (
            <SkillRow key={s.id} skill={s} navigate={navigate} isMobile={isMobile} />
          ))}
          {items.length > GROUP_CAP && (
            <button type="button" className="btn btn-ghost self-start" style={{ marginTop: 6, fontSize: 13 }} onClick={onShowAll}>
              {showAll ? 'Show fewer' : `Show all ${items.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Learn — the learning suite's overview: streak & XP, what to do next,
 *  every course's roadmap progress, skills due for a refresh, and the
 *  cross-course skill list. */
export default function LearnPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const overview = useLearningStore((s) => s.overview);
  const skills = useLearningStore((s) => s.skills);
  const loadOverview = useLearningStore((s) => s.loadOverview);
  const loadSkills = useLearningStore((s) => s.loadSkills);
  const plan = useVideoStore((s) => s.plan);
  const searchingSkills = useVideoStore((s) => s.searchingSkills);
  const loadPlan = useVideoStore((s) => s.loadPlan);
  const searchSkillVideos = useVideoStore((s) => s.searchSkillVideos);

  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [open, setOpen] = useState<Record<Mastery, boolean>>({ learned: true, learning: true, not_started: true });
  const [showAll, setShowAll] = useState<Record<Mastery, boolean>>({ learned: false, learning: false, not_started: false });
  const [showAllShared, setShowAllShared] = useState(false);
  const [videoErrors, setVideoErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    loadOverview()
      .then(() => {
        if (!cancelled) setOverviewError(null);
      })
      .catch((err) => {
        if (!cancelled) setOverviewError(errorMessage(err));
      });
    loadSkills(true)
      .then(() => {
        if (!cancelled) setSkillsError(null);
      })
      .catch((err) => {
        if (!cancelled) setSkillsError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [loadOverview, loadSkills, reloadKey]);

  useEffect(() => {
    // The video plan only decorates the shared-milestone rows; without it they still offer "Find videos".
    loadPlan().catch(() => {});
  }, [loadPlan, reloadKey]);

  // Searches queued elsewhere (the videos page, a course page) leave milestones 'searching' server-side
  // for 20-90 s each; keep polling so those rows resolve here too (mirrors VideoPlanPage).
  useEffect(() => {
    if (!plan || plan.stats.searching === 0) return;
    const t = setInterval(() => {
      loadPlan().catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [plan, loadPlan]);

  const retry = () => setReloadKey((k) => k + 1);
  const toggleGroup = (m: Mastery) => setOpen((o) => ({ ...o, [m]: !o[m] }));
  const toggleShowAll = (m: Mastery) => setShowAll((o) => ({ ...o, [m]: !o[m] }));

  const groups = useMemo(() => {
    const by: Record<Mastery, SkillWithCourses[]> = { learned: [], learning: [], not_started: [] };
    for (const s of skills ?? []) by[s.mastery].push(s);
    by.learning.sort((a, b) => b.masteryScore - a.masteryScore || a.label.localeCompare(b.label));
    by.learned.sort((a, b) => (b.learnedAt ?? '').localeCompare(a.learnedAt ?? '') || a.label.localeCompare(b.label));
    by.not_started.sort((a, b) => a.label.localeCompare(b.label));
    return by;
  }, [skills]);

  /** Unlearned skills taught by ≥ 2 courses, most-shared first. */
  const sharedSkills = useMemo(
    () =>
      (skills ?? [])
        .filter((s) => s.courses.length >= 2 && s.mastery !== 'learned')
        .sort((a, b) => b.courses.length - a.courses.length || a.label.localeCompare(b.label)),
    [skills],
  );

  const planBySkill = useMemo(() => {
    const by: Record<string, PlanMilestone> = {};
    for (const m of plan?.milestones ?? []) by[m.skillId] = m;
    return by;
  }, [plan]);

  /** Every `bestVideoId` is drawn from `plan.videos`, so this resolves the RankedVideo behind it. */
  const videoById = useMemo(() => {
    const by: Record<string, RankedVideo> = {};
    for (const v of plan?.videos ?? []) by[v.id] = v;
    return by;
  }, [plan]);

  const findVideos = async (skillId: string, force: boolean) => {
    setVideoErrors((e) => {
      if (!(skillId in e)) return e;
      const rest = { ...e };
      delete rest[skillId];
      return rest;
    });
    try {
      await searchSkillVideos(skillId, force);
    } catch (err) {
      setVideoErrors((e) => ({ ...e, [skillId]: errorMessage(err) }));
    } finally {
      // Success or failure, replace the plan snapshot with the server's real status.
      await loadPlan().catch(() => {});
    }
  };

  const stepForSkill = (skillId: string) => skills?.find((s) => s.id === skillId)?.courses[0]?.stepId ?? null;

  const courses = overview?.courses ?? [];
  const continueCourse = courses.find((c) => c.nextStep) ?? null;
  const nextStep = continueCourse?.nextStep ?? null;
  const anyRoadmap = courses.some((c) => c.roadmapId);
  const anyBuilding = courses.some((c) => c.status === 'generating' || c.status === 'pending');

  return (
    <div style={{ maxWidth: 860, padding: 'var(--space-6) var(--space-4)', boxSizing: 'border-box' }}>
      <div className="card-kicker">Learning suite</div>
      <h1 style={{ fontSize: 32, margin: 'var(--space-1) 0 var(--space-2)' }}>Learn</h1>
      <p style={{ fontSize: 15, opacity: 0.6, margin: '0 0 var(--space-6)' }}>
        Roadmaps built from your materials. Pick a topic, prove you know it, and it counts across every course.
      </p>

      {!overview ? (
        overviewError ? (
          <InlineError message={`Couldn't load your learning overview: ${overviewError}`} onRetry={retry} />
        ) : (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )
      ) : courses.length === 0 ? (
        <EmptyState
          icon={<PiRocketLaunchDuotone />}
          title="Nothing to learn yet"
          description="Create a course and add its materials — Inkwell turns them into a roadmap of skills you can learn step by step."
          action={{ label: 'Go to courses', onClick: () => navigate('/courses') }}
        />
      ) : (
        <>
          {overviewError && (
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <InlineError message={`Couldn't refresh — showing what we had: ${overviewError}`} onRetry={retry} />
            </div>
          )}

          {/* Stats strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-6)',
            }}
          >
            <StatTile
              value={<>🔥 {overview.profile.streak}</>}
              label="day streak"
              sub={`longest ${overview.profile.longestStreak}`}
            />
            <StatTile
              value={overview.profile.xp.toLocaleString()}
              label="XP total"
              sub={`${overview.activitiesCompleted} ${overview.activitiesCompleted === 1 ? 'activity' : 'activities'} completed`}
            />
            <StatTile
              value={
                <>
                  {overview.profile.xpToday}
                  <span style={{ opacity: 0.45, fontSize: 16 }}>/{overview.profile.dailyGoalXp} XP</span>
                </>
              }
              label={overview.profile.goalHitToday ? 'Today · Goal hit ✓' : 'Today'}
              labelColor={overview.profile.goalHitToday ? 'var(--color-success)' : undefined}
            >
              <div style={{ marginTop: 8 }}>
                <Meter
                  height={5}
                  segments={[
                    {
                      fraction: overview.profile.dailyGoalXp > 0 ? overview.profile.xpToday / overview.profile.dailyGoalXp : 0,
                      color: overview.profile.goalHitToday ? 'var(--color-success)' : 'var(--color-accent)',
                    },
                  ]}
                />
              </div>
            </StatTile>
            <StatTile
              value={`${overview.skillsLearned}/${overview.skillsTotal}`}
              label="skills learned"
              sub={`${overview.skillsLearning} in progress`}
            />
          </div>

          {/* Continue hero */}
          {continueCourse && nextStep ? (
            <Hero
              kicker="Up next"
              title={nextStep.title}
              blurb={`${continueCourse.courseName} · ≈ ${nextStep.estimatedMinutes} min`}
            >
              <button type="button" className="btn btn-primary" onClick={() => navigate(`/learn/steps/${nextStep.id}`)}>
                Continue
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => navigate('/learn/videos')}>
                <HiOutlinePlay className="h-4 w-4" /> Videos
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => navigate(`/courses/${continueCourse.courseId}`)}>
                View roadmap
              </button>
            </Hero>
          ) : !anyRoadmap ? (
            <Hero
              kicker="Get started"
              title="Build your first roadmap"
              blurb="Inkwell reads a course's materials and turns them into an ordered path of skills — each with a lesson, flashcards, a quiz and a tutor."
            >
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate(courses[0] ? `/courses/${courses[0].courseId}` : '/courses')}
              >
                Build your first roadmap
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => navigate('/learn/videos')}>
                Videos
              </button>
            </Hero>
          ) : anyBuilding ? (
            <Hero kicker="Building" title="Your roadmap is on its way" blurb="Steps appear here as soon as the roadmap is ready.">
              <Spinner size="sm" />
              <span style={{ fontSize: 13, opacity: 0.6 }}>Building…</span>
            </Hero>
          ) : (
            <Hero
              kicker="All caught up"
              title="Every step is learned"
              blurb="Refresh a skill below, or add materials to a course to grow its roadmap."
            >
              <button type="button" className="btn btn-secondary" onClick={() => navigate('/courses')}>
                Courses
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => navigate('/learn/videos')}>
                Videos
              </button>
            </Hero>
          )}

          {/* Courses */}
          <div style={{ marginBottom: 'var(--space-8)' }}>
            <SectionHeader
              label="Courses"
              aside={
                <a className="cursor-pointer" style={{ fontSize: 13, color: 'var(--color-accent-700)' }} onClick={() => navigate('/courses')}>
                  All courses →
                </a>
              }
            />
            <div className="flex flex-col">
              {courses.map((c) => (
                <CourseRow key={c.courseId} course={c} navigate={navigate} />
              ))}
            </div>
          </div>

          {/* Shared milestones */}
          {sharedSkills.length > 0 && (
            <div style={{ marginBottom: 'var(--space-8)' }}>
              <SectionHeader
                label="Shared milestones — learn once, count everywhere"
                aside={
                  <a
                    className="cursor-pointer whitespace-nowrap"
                    style={{ fontSize: 13, color: 'var(--color-accent-700)' }}
                    onClick={() => navigate('/learn/videos')}
                  >
                    All videos →
                  </a>
                }
              />
              <p style={{ fontSize: 13, opacity: 0.55, margin: '0 0 var(--space-2)' }}>
                These topics appear on more than one roadmap. Master one here and every course that teaches it is updated.
              </p>
              <div className="flex flex-col">
                {(showAllShared ? sharedSkills : sharedSkills.slice(0, SHARED_CAP)).map((s) => {
                  const milestone = planBySkill[s.id];
                  return (
                    <SharedSkillRow
                      key={s.id}
                      skill={s}
                      milestone={milestone}
                      best={milestone?.bestVideoId ? videoById[milestone.bestVideoId] : undefined}
                      searching={!!searchingSkills[s.id]}
                      error={videoErrors[s.id]}
                      navigate={navigate}
                      onFind={findVideos}
                      isMobile={isMobile}
                    />
                  );
                })}
                {sharedSkills.length > SHARED_CAP && (
                  <button
                    type="button"
                    className="btn btn-ghost self-start"
                    style={{ marginTop: 6, fontSize: 13 }}
                    onClick={() => setShowAllShared((v) => !v)}
                  >
                    {showAllShared ? 'Show fewer' : `Show all ${sharedSkills.length}`}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Review suggestions */}
          {overview.reviewSuggestions.length > 0 && (
            <div style={{ marginBottom: 'var(--space-8)' }}>
              <SectionHeader label="Refresh your memory" />
              <div className="flex flex-col">
                {overview.reviewSuggestions.map(({ skill, stepId, courseName }) => {
                  const target = stepId ?? stepForSkill(skill.id);
                  return (
                    <div key={skill.id} className="flex items-center" style={{ ...rowStyle, padding: '10px 0', gap: 'var(--space-3)' }}>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold" style={{ fontSize: 15 }}>
                          {skill.label}
                        </div>
                        <div style={{ fontSize: 13, opacity: 0.55 }}>
                          {[courseName, learnedAgo(skill.learnedAt)].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      {target && (
                        <button type="button" className={`btn btn-secondary ${smallBtn}`} onClick={() => navigate(`/learn/steps/${target}`)}>
                          Review
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recently learned */}
          {overview.recentlyLearned.length > 0 && (
            <div style={{ marginBottom: 'var(--space-8)' }}>
              <SectionHeader label="Recently learned" />
              <div className="flex flex-wrap" style={{ gap: 8 }}>
                {overview.recentlyLearned.map((s) => {
                  const target = stepForSkill(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      title={learnedAgo(s.learnedAt)}
                      onClick={() => target && navigate(`/learn/steps/${target}`)}
                      style={{
                        ...chipStyle,
                        cursor: target ? 'pointer' : 'default',
                        borderColor: 'color-mix(in srgb, var(--color-success) 45%, var(--color-neutral-300))',
                        background: 'color-mix(in srgb, var(--color-success) 10%, var(--color-surface))',
                      }}
                    >
                      ✓ {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* All skills */}
          <div>
            <SectionHeader
              label="All skills"
              aside={
                skills && skills.length > 0 ? (
                  <span className="whitespace-nowrap" style={{ fontSize: 13, opacity: 0.5 }}>
                    {plural(skills.length, 'skill')} · {plural(courses.length, 'course')}
                  </span>
                ) : undefined
              }
            />
            {skillsError ? (
              <InlineError message={`Couldn't load skills: ${skillsError}`} onRetry={retry} />
            ) : skills === null ? (
              <div className="flex justify-center py-6">
                <Spinner size="sm" />
              </div>
            ) : skills.length === 0 ? (
              <div style={{ fontSize: 14, opacity: 0.6, padding: '10px 0', borderTop: '1px solid var(--color-neutral-300)' }}>
                No skills yet — build a roadmap for a course and its skills show up here.
              </div>
            ) : (
              GROUP_ORDER.map((m) => (
                <SkillGroup
                  key={m}
                  mastery={m}
                  items={groups[m]}
                  open={open[m]}
                  showAll={showAll[m]}
                  onToggle={() => toggleGroup(m)}
                  onShowAll={() => toggleShowAll(m)}
                  navigate={navigate}
                  isMobile={isMobile}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
