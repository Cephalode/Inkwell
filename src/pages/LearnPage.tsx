import { useEffect, useMemo, type CSSProperties, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PiRocketLaunchDuotone } from 'react-icons/pi';
import Spinner from '../components/shared/Spinner';
import EmptyState from '../components/shared/EmptyState';
import CourseRoadmap from '../components/course/CourseRoadmap';
import { useLearningStore } from '../store/learningStore';
import { useCourses } from '../hooks/useCourses';
import { mergeRoadmaps } from '../utils/mergeRoadmaps';

const pillStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  padding: '5px 14px',
  borderRadius: 999,
  cursor: 'pointer',
  border: '1px solid var(--color-divider)',
};

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        ...pillStyle,
        background: active ? 'var(--color-accent)' : 'transparent',
        borderColor: active ? 'var(--color-accent)' : 'var(--color-divider)',
        color: active ? 'var(--color-bg)' : 'var(--color-text)',
        opacity: active ? 1 : 0.75,
      }}
    >
      {children}
    </button>
  );
}

/** Home — the roadmap. A course picker ("All courses" + one per course) above
 *  the Duolingo-style trail (CourseRoadmap). Selection lives in the URL so
 *  links are shareable: /learn?course=:id, bare /learn = current course or all. */
export default function LearnPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { courses, isLoading, loadCourses } = useCourses();
  const cached = useLearningStore((s) => s.roadmapsByCourseId);
  const loadRoadmap = useLearningStore((s) => s.loadRoadmap);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  // Resolve selection: URL param (including explicit `all`) > the server's
  // current course > all. Bare /learn always lands on the current course.
  const withMaterials = useMemo(() => courses.filter((c) => c.documentIds.length > 0), [courses]);
  const selected = params.get('course') ?? courses.find((c) => c.isCurrent)?.id ?? 'all';
  const course = selected === 'all' ? undefined : courses.find((c) => c.id === selected);

  // The merged view needs every course's roadmap; single view lets CourseRoadmap self-load.
  useEffect(() => {
    if (selected !== 'all') return;
    for (const c of withMaterials) void loadRoadmap(c.id, true).catch(() => {});
  }, [selected, withMaterials, loadRoadmap]);

  const merged = useMemo(
    () => mergeRoadmaps(courses, withMaterials.map((c) => cached[c.id])),
    [courses, withMaterials, cached],
  );
  const mergedReady = withMaterials.length > 0 && withMaterials.every((c) => cached[c.id] !== undefined);

  const pick = (id: string) => setParams(id === 'all' ? { course: 'all' } : { course: id });

  if (courses.length === 0) {
    return (
      <div style={{ maxWidth: 860, margin: '0 auto', padding: 'var(--space-6) var(--space-4)', boxSizing: 'border-box' }}>
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <EmptyState
            icon={<PiRocketLaunchDuotone />}
            title="Nothing to learn yet"
            description="Create a course and add its materials — Inkwell turns them into a roadmap of skills you can learn step by step."
            action={{ label: 'Go to courses', onClick: () => navigate('/courses') }}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: 'var(--space-6) var(--space-4) 80px', boxSizing: 'border-box' }}>
      {/* Course picker — iOS CoursePickerBar, web-shaped */}
      <div className="flex flex-wrap items-center gap-1.5" style={{ marginBottom: 'var(--space-5)' }}>
        <Pill active={selected === 'all'} onClick={() => pick('all')}>
          All courses
        </Pill>
        {courses.map((c) => (
          <Pill key={c.id} active={selected === c.id} onClick={() => pick(c.id)}>
            {c.isCurrent ? '★ ' : ''}
            {c.name}
          </Pill>
        ))}
      </div>

      {course ? (
        <CourseRoadmap key={course.id} course={course} />
      ) : !mergedReady ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : merged.status !== 'done' ? (
        <div className="card p-5">
          <div className="card-kicker">All courses</div>
          <h2 className="mt-1.5 text-lg font-semibold">No roadmaps yet</h2>
          <p className="mt-1 text-sm" style={{ opacity: 0.65 }}>
            Pick a course and build its roadmap — once built, every course combines into one path here.
          </p>
          <div className="mt-3 flex flex-col">
            {withMaterials.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c.id)}
                className="flex items-center justify-between text-left text-sm transition-colors hover:text-[var(--color-accent)]"
                style={{ padding: '8px 0', borderTop: '1px solid var(--color-divider)' }}
              >
                <span>{c.name}</span>
                <span aria-hidden>→</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <CourseRoadmap
          key="all"
          isMerged
          course={{ id: 'all', name: 'All courses', documentIds: withMaterials.flatMap((c) => c.documentIds), createdAt: 0, updatedAt: 0 }}
          roadmap={merged}
        />
      )}
    </div>
  );
}
