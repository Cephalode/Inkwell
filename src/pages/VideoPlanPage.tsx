import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { HiOutlineMagnifyingGlass, HiOutlinePlay, HiOutlineSparkles } from 'react-icons/hi2';
import { PiVideoDuotone } from 'react-icons/pi';
import EmptyState from '../components/shared/EmptyState';
import Spinner from '../components/shared/Spinner';
import VideoCard from '../components/videos/VideoCard';
import { useCourses } from '../hooks/useCourses';
import { useIsMobile } from '../hooks/useIsMobile';
import { useLearningStore } from '../store/learningStore';
import { useVideoStore } from '../store/videoStore';
import type { PlanMilestone, RankedVideo } from '../types/videos';

const SEARCHING_LINE = 'Searching YouTube, reading captions, judging…';
/** How many milestones one "Find videos for my next milestones" run searches. */
const PLAN_LIMIT = 5;
const REST_CAP = 8;
/** Default number of "Best value" videos shown before "Show all". */
const BEST_CAP = 3;

type Navigate = (to: string) => void;

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));
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

const activeChipStyle: CSSProperties = {
  ...chipStyle,
  color: 'var(--color-accent-700)',
  borderColor: 'color-mix(in srgb, var(--color-accent) 45%, transparent)',
  background: 'color-mix(in srgb, var(--color-accent) 12%, var(--color-surface))',
};

const smallBtn = 'text-[13px] px-2.5 py-1';

function StatTile({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="card min-w-0" style={{ padding: 'var(--space-3) var(--space-4)' }}>
      <div className="font-semibold" style={{ fontSize: 24, lineHeight: 1.15 }}>
        {value}
      </div>
      <div style={{ fontSize: 12.5, marginTop: 2, opacity: 0.6 }}>{label}</div>
    </div>
  );
}

function SectionHeader({ label, hint, aside }: { label: string; hint?: string; aside?: ReactNode }) {
  return (
    <div
      className="flex flex-wrap items-baseline justify-between"
      style={{ gap: 'var(--space-2) var(--space-3)', marginBottom: 'var(--space-2)' }}
    >
      <div className="flex min-w-0 flex-wrap items-baseline" style={{ gap: 8 }}>
        <span className="section-label">{label}</span>
        {hint && <span style={{ fontSize: 13, opacity: 0.55 }}>— {hint}</span>}
      </div>
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

function CourseChips({
  courses,
  active,
  disabled,
  onPick,
}: {
  courses: Array<{ id: string; name: string }>;
  active: string | null;
  disabled: boolean;
  onPick: (courseId: string | null) => void;
}) {
  const styleFor = (on: boolean): CSSProperties => ({
    ...(on ? activeChipStyle : chipStyle),
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  });
  return (
    <div role="group" aria-label="Filter by course" className="flex flex-wrap" style={{ gap: 6 }}>
      <button type="button" aria-pressed={active === null} disabled={disabled} style={styleFor(active === null)} onClick={() => onPick(null)}>
        All
      </button>
      {courses.map((c) => (
        <button
          key={c.id}
          type="button"
          aria-pressed={active === c.id}
          disabled={disabled}
          style={styleFor(active === c.id)}
          title={c.name}
          onClick={() => onPick(c.id)}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}

/** One unlearned milestone: its label, the courses that teach it, and the
 *  best video (or a way to go find one). */
function MilestoneRow({
  m,
  video,
  searching,
  error,
  onSearch,
  navigate,
  isMobile,
}: {
  m: PlanMilestone;
  video: RankedVideo | null;
  searching: boolean;
  error: string | null;
  onSearch: (force: boolean) => void;
  navigate: Navigate;
  isMobile: boolean;
}) {
  const shared = m.courses.length > 1;

  let aside: ReactNode;
  if (searching) {
    aside = (
      <div className="flex items-center" style={{ gap: 10, fontSize: 13, opacity: 0.7, padding: '6px 0' }} aria-live="polite">
        <Spinner size="sm" />
        <span>{SEARCHING_LINE}</span>
      </div>
    );
  } else if (error) {
    aside = (
      <div className="flex flex-wrap items-center" style={{ gap: 8, fontSize: 13, color: 'var(--color-danger)' }}>
        <span className="min-w-0 flex-1">{error}</span>
        <button type="button" className={`btn btn-secondary ${smallBtn}`} style={{ color: 'var(--color-text)' }} onClick={() => onSearch(true)}>
          Retry
        </button>
      </div>
    );
  } else if (video) {
    aside = <VideoCard video={video} compact highlightSkillId={m.skillId} />;
  } else if (m.searchStatus === 'done') {
    aside = (
      <div className="flex flex-wrap items-center" style={{ gap: 8, fontSize: 13, opacity: 0.65 }}>
        <span className="min-w-0 flex-1">
          {m.videoCount > 0 ? 'No video teaches this well enough yet.' : 'Nothing worth your time found.'}
        </span>
        <button type="button" className={`btn btn-secondary ${smallBtn}`} onClick={() => onSearch(true)}>
          Search again
        </button>
      </div>
    );
  } else {
    aside = (
      <button type="button" className="btn btn-secondary" onClick={() => onSearch(false)}>
        <HiOutlineMagnifyingGlass className="h-4 w-4" />
        Find videos
      </button>
    );
  }

  return (
    <div
      style={{
        ...rowStyle,
        display: 'grid',
        gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 380px',
        gap: isMobile ? 10 : 'var(--space-4)',
        alignItems: 'start',
      }}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline" style={{ gap: 8 }}>
          <span className="font-semibold" style={{ fontSize: 15 }}>
            {m.label}
          </span>
          {shared && (
            <span style={{ fontSize: 12, color: 'var(--color-accent-700)' }}>shared by {m.courses.length} courses</span>
          )}
          {m.mastery === 'learning' && <span style={{ fontSize: 12, opacity: 0.5 }}>in progress</span>}
          {m.videoCount > 0 && <span style={{ fontSize: 12, opacity: 0.5 }}>{plural(m.videoCount, 'video')} judged</span>}
        </div>
        {m.courses.length > 0 && (
          <div className="flex flex-wrap" style={{ gap: 6, marginTop: 6 }}>
            {m.courses.map((c) => (
              <button
                key={c.stepId}
                type="button"
                style={chipStyle}
                title={`Open step ${c.position + 1} of ${c.courseName}`}
                onClick={() => navigate(`/learn/steps/${c.stepId}`)}
              >
                {c.courseName}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="min-w-0">{aside}</div>
    </div>
  );
}

/** /learn/videos — the shortest path through the learner's milestones:
 *  videos that teach several at once first, shared milestones next, then
 *  everything else that is still unlearned. Optional `?courseId=` filter. */
export default function VideoPlanPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const courseId = searchParams.get('courseId') || undefined;

  const plan = useVideoStore((s) => s.plan);
  const planCourseId = useVideoStore((s) => s.planCourseId);
  const searchingSkills = useVideoStore((s) => s.searchingSkills);
  const loadPlan = useVideoStore((s) => s.loadPlan);
  const runPlan = useVideoStore((s) => s.runPlan);
  const searchSkillVideos = useVideoStore((s) => s.searchSkillVideos);
  const overview = useLearningStore((s) => s.overview);
  const loadOverview = useLearningStore((s) => s.loadOverview);
  const { courses, loadCourses } = useCourses();

  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [running, setRunning] = useState(false);
  /** `stats.searched` when the current run started — progress is measured from here. */
  const [runBase, setRunBase] = useState<number | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [skillErrors, setSkillErrors] = useState<Record<string, string>>({});
  const [showAllRest, setShowAllRest] = useState(false);
  const [showAllBest, setShowAllBest] = useState(false);

  useEffect(() => {
    void loadCourses().catch(() => {});
    void loadOverview().catch(() => {});
  }, [loadCourses, loadOverview]);

  useEffect(() => {
    let cancelled = false;
    loadPlan(courseId)
      .then(() => {
        if (!cancelled) setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, loadPlan, reloadKey]);

  // The store holds one plan — whichever course was loaded last.
  const current = plan && planCourseId === (courseId ?? null) ? plan : null;
  const searching = current?.stats.searching ?? 0;
  const busy = running || searching > 0;

  // Searches queued elsewhere (a course page, another tab) or left over after
  // runPlan gives up keep this page live. Each poll re-arms the next one whether
  // it succeeded or not — a failed poll must not strand `busy` at true — and a
  // failure is surfaced through `loadError` so Retry is available.
  const polling = !running && searching > 0;
  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      timer = setTimeout(() => {
        loadPlan(courseId)
          .then(() => {
            if (!cancelled) setLoadError(null);
          })
          .catch((err: unknown) => {
            if (!cancelled) setLoadError(errorMessage(err));
          })
          .finally(() => {
            if (!cancelled) arm();
          });
      }, 3000);
    };
    arm();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [polling, courseId, loadPlan]);

  const pickCourse = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('courseId', id);
    else next.delete('courseId');
    setSearchParams(next, { replace: true });
  };

  const startRun = async () => {
    if (!current) return;
    setRunning(true);
    setRunError(null);
    setRunBase(current.stats.searched);
    try {
      await runPlan({ courseId, limit: PLAN_LIMIT });
    } catch (err) {
      setRunError(errorMessage(err));
    } finally {
      setRunning(false);
      setRunBase(null);
    }
  };

  const searchSkill = useCallback(
    async (skillId: string, force: boolean) => {
      setSkillErrors((e) => {
        const rest = { ...e };
        delete rest[skillId];
        return rest;
      });
      try {
        await searchSkillVideos(skillId, force);
      } catch (err) {
        setSkillErrors((e) => ({ ...e, [skillId]: errorMessage(err) }));
      } finally {
        // Reload whichever plan is on screen now (the filter may have changed meanwhile).
        await loadPlan(useVideoStore.getState().planCourseId ?? undefined).catch(() => {});
      }
    },
    [searchSkillVideos, loadPlan],
  );

  const sections = useMemo(() => {
    if (!current) return null;
    const byId = new Map(current.videos.map((v) => [v.id, v] as const));
    return {
      byId,
      bestValue: current.videos.filter((v) => v.unlearnedMilestones >= 2),
      restVideos: current.videos.filter((v) => v.unlearnedMilestones < 2),
      shared: current.milestones.filter((m) => m.courses.length > 1),
      single: current.milestones.filter((m) => m.courses.length <= 1),
    };
  }, [current]);

  const progressLabel = (() => {
    if (runBase !== null && current) {
      const done = Math.max(0, current.stats.searched - runBase);
      const total = done + searching;
      return total > 0 ? `${done} of ${total} milestones` : 'queuing…';
    }
    return `${plural(searching, 'milestone')} still searching`;
  })();

  const courseName = courseId ? (courses.find((c) => c.id === courseId)?.name ?? 'this course') : null;
  const anyRoadmap = overview ? overview.courses.some((c) => c.roadmapId) : true;
  const courseHasRoadmap = courseId
    ? overview
      ? !!overview.courses.find((c) => c.courseId === courseId)?.roadmapId
      : true
    : anyRoadmap;
  const planEmpty = current !== null && current.milestones.length === 0 && current.videos.length === 0;

  const renderMilestone = (m: PlanMilestone) => (
    <MilestoneRow
      key={m.skillId}
      m={m}
      video={m.bestVideoId ? (sections?.byId.get(m.bestVideoId) ?? null) : null}
      searching={!!searchingSkills[m.skillId] || m.searchStatus === 'searching'}
      error={skillErrors[m.skillId] ?? (m.searchStatus === 'error' ? m.searchError || 'Search failed' : null)}
      onSearch={(force) => void searchSkill(m.skillId, force)}
      navigate={navigate}
      isMobile={isMobile}
    />
  );

  return (
    <div className="space-y-6" style={{ maxWidth: 860 }}>
      <div>
        <div className="card-kicker">Learning suite</div>
        <h1 style={{ fontSize: 32, margin: 'var(--space-1) 0 var(--space-2)' }}>Videos</h1>
        <p style={{ fontSize: 15, opacity: 0.6, margin: 0 }}>
          The shortest path through your milestones: videos that teach several at once come first, and a milestone
          shared by two courses only has to be learned once.
        </p>
      </div>

      {courses.length > 0 && <CourseChips courses={courses} active={courseId ?? null} disabled={running} onPick={pickCourse} />}

      {!current || !sections ? (
        loadError ? (
          <InlineError message={`Couldn't load your video plan: ${loadError}`} onRetry={() => setReloadKey((k) => k + 1)} />
        ) : (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )
      ) : planEmpty ? (
        !courseHasRoadmap ? (
          courseId ? (
            <EmptyState
              icon={<PiVideoDuotone />}
              title={`No roadmap for ${courseName} yet`}
              description="Videos are matched against a course's milestones. Build the roadmap first and come back."
              action={{ label: 'Build the roadmap', onClick: () => navigate(`/courses/${courseId}`) }}
            />
          ) : (
            <EmptyState
              icon={<PiVideoDuotone />}
              title="No roadmaps yet"
              description="Videos are matched against your roadmaps' milestones. Build a roadmap for a course first and come back."
              action={{ label: 'Go to Learn', onClick: () => navigate('/learn') }}
            />
          )
        ) : (
          <EmptyState
            icon={<PiVideoDuotone />}
            title={courseName ? `Nothing left to learn in ${courseName}` : 'Nothing left to learn'}
            description="Every milestone is learned. Add materials to a course to grow its roadmap, or refresh a skill from Learn."
            action={{ label: 'Go to Learn', onClick: () => navigate('/learn') }}
          />
        )
      ) : (
        <>
          {loadError && (
            <InlineError message={`Couldn't refresh — showing what we had: ${loadError}`} onRetry={() => setReloadKey((k) => k + 1)} />
          )}

          {/* Stats strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 'var(--space-3)',
            }}
          >
            <StatTile value={current.stats.unlearned} label="unlearned milestones" />
            <StatTile value={current.stats.shared} label="shared milestones" />
            <StatTile
              value={
                <>
                  {current.stats.searched}
                  <span style={{ opacity: 0.45, fontSize: 16 }}>/{current.stats.unlearned}</span>
                </>
              }
              label="searched"
            />
            <StatTile value={current.stats.videos} label="videos" />
          </div>

          {/* Primary action */}
          <div
            className="card"
            style={{ padding: 'var(--space-5)', borderColor: 'color-mix(in srgb, var(--color-accent) 45%, transparent)' }}
          >
            <div className="flex items-center gap-2" style={{ color: 'var(--color-accent)' }}>
              <HiOutlineSparkles className="h-4 w-4" />
              <span className="card-kicker">{busy ? 'Searching' : 'Next up'}</span>
            </div>
            <h2 style={{ fontSize: 22, margin: 'var(--space-2) 0 var(--space-1)', lineHeight: 1.25 }}>
              {current.stats.videos === 0 ? 'Find your first videos' : 'Find videos for your next milestones'}
            </h2>
            <div style={{ fontSize: 14, opacity: 0.6 }}>
              Searches YouTube for your {PLAN_LIMIT} most-shared unlearned milestones{courseName ? ` in ${courseName}` : ''},
              reads the captions and judges how much of each milestone every video teaches — about a minute per milestone.
            </div>
            <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void startRun()}>
                <HiOutlineMagnifyingGlass className="h-4 w-4" />
                Find videos for my next milestones
              </button>
              {busy && (
                <div className="flex items-center" style={{ gap: 10, fontSize: 13, opacity: 0.75 }} aria-live="polite">
                  <Spinner size="sm" />
                  <span>
                    {SEARCHING_LINE} {progressLabel}
                  </span>
                </div>
              )}
            </div>
            {runError && (
              <div style={{ marginTop: 'var(--space-3)' }}>
                <InlineError message={runError} onRetry={() => void startRun()} />
              </div>
            )}
          </div>

          {/* 1 · Best value */}
          {sections.bestValue.length > 0 && (
            <section>
              <SectionHeader
                label="Best value"
                hint="several milestones in one video"
                aside={
                  <span className="whitespace-nowrap" style={{ fontSize: 13, opacity: 0.5 }}>
                    {plural(sections.bestValue.length, 'video')}
                  </span>
                }
              />
              <div className="flex flex-col" style={{ gap: 10 }}>
                {(showAllBest ? sections.bestValue : sections.bestValue.slice(0, BEST_CAP)).map((v, i) => (
                  <VideoCard key={v.id} video={v} rank={i + 1} />
                ))}
              </div>
              {sections.bestValue.length > BEST_CAP && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ marginTop: 8, fontSize: 13 }}
                  onClick={() => setShowAllBest((o) => !o)}
                >
                  <HiOutlinePlay className="h-3.5 w-3.5" />
                  {showAllBest ? 'Show fewer' : `Show all ${sections.bestValue.length}`}
                </button>
              )}
            </section>
          )}

          {/* 2 · Shared milestones */}
          {sections.shared.length > 0 && (
            <section>
              <SectionHeader
                label="Shared milestones"
                hint="learn once, count everywhere"
                aside={
                  <span className="whitespace-nowrap" style={{ fontSize: 13, opacity: 0.5 }}>
                    {plural(sections.shared.length, 'milestone')}
                  </span>
                }
              />
              <div className="flex flex-col">{sections.shared.map(renderMilestone)}</div>
            </section>
          )}

          {/* 3 · By milestone */}
          {sections.single.length > 0 && (
            <section>
              <SectionHeader
                label="By milestone"
                hint="still ahead of you"
                aside={
                  <span className="whitespace-nowrap" style={{ fontSize: 13, opacity: 0.5 }}>
                    {plural(sections.single.length, 'milestone')}
                  </span>
                }
              />
              <div className="flex flex-col">{sections.single.map(renderMilestone)}</div>
            </section>
          )}

          {/* 4 · All videos */}
          {sections.restVideos.length > 0 && (
            <section>
              <SectionHeader
                label="All videos"
                hint="one milestone each"
                aside={
                  <span className="whitespace-nowrap" style={{ fontSize: 13, opacity: 0.5 }}>
                    {plural(sections.restVideos.length, 'video')}
                  </span>
                }
              />
              <div className="flex flex-col" style={{ gap: 10 }}>
                {(showAllRest ? sections.restVideos : sections.restVideos.slice(0, REST_CAP)).map((v) => (
                  <VideoCard key={v.id} video={v} />
                ))}
              </div>
              {sections.restVideos.length > REST_CAP && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ marginTop: 8, fontSize: 13 }}
                  onClick={() => setShowAllRest((o) => !o)}
                >
                  <HiOutlinePlay className="h-3.5 w-3.5" />
                  {showAllRest ? 'Show fewer' : `Show all ${sections.restVideos.length}`}
                </button>
              )}
            </section>
          )}

          {current.videos.length === 0 && (
            <p style={{ fontSize: 14, opacity: 0.6, margin: 0 }}>
              No videos judged yet — run the search above, or use “Find videos” on a single milestone.
            </p>
          )}
        </>
      )}
    </div>
  );
}
