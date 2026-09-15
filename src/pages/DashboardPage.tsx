import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentStore } from '../store/documentStore';
import { useCourseStore } from '../store/courseStore';
import { useFlashcardStore } from '../store/flashcardStore';
import { useCourses } from '../hooks/useCourses';
import { useLearningStore } from '../store/learningStore';
import { useVideoStore } from '../store/videoStore';

interface TodayTask {
  id: string;
  label: string;
  meta: string;
  to: string;
}

/** Home — the Study Desk prototype's "Today" screen, built from real data:
 *  a short plan (recent reading, decks to review, uploads still classifying),
 *  recent materials, and courses. */
export default function DashboardPage() {
  const navigate = useNavigate();
  const documents = useDocumentStore((s) => s.documents);
  const courses = useCourseStore((s) => s.courses);
  const decks = useFlashcardStore((s) => s.decks);
  const fetchDecks = useFlashcardStore((s) => s.fetchDecks);
  const overview = useLearningStore((s) => s.overview);
  const plan = useVideoStore((s) => s.plan);
  const { loadCourses } = useCourses();
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadCourses();
    fetchDecks().catch(() => {});
    useLearningStore.getState().loadOverview().catch(() => {});
    useVideoStore.getState().loadPlan().catch(() => {});
  }, [loadCourses, fetchDecks]);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const unclassified = documents.filter(
    (d) => d.classifyStatus === 'pending' || d.classifyStatus === 'classifying'
  ).length;

  const tasks: TodayTask[] = useMemo(() => {
    const t: TodayTask[] = [];
    const learnCourse = overview?.courses.find((c) => c.nextStep);
    if (learnCourse?.nextStep) {
      t.push({
        id: 'learn-next',
        label: `Continue ${learnCourse.nextStep.title} — ${learnCourse.courseName}`,
        meta: `≈ ${learnCourse.nextStep.estimatedMinutes} min`,
        to: `/learn/steps/${learnCourse.nextStep.id}`,
      });
    }
    // The plan's top video is the best value for the learner's time right now.
    const bestVideo = plan?.videos[0];
    if (bestVideo && !bestVideo.watchedAt) {
      const n = bestVideo.unlearnedMilestones || bestVideo.milestones.length;
      t.push({
        id: 'watch-best',
        label: `Watch "${bestVideo.title}" — covers ${n} milestone${n === 1 ? '' : 's'}`,
        meta: `${Math.round(bestVideo.durationSeconds / 60)} min`,
        to: `/learn/videos/${bestVideo.id}`,
      });
    }
    const recentDoc = documents[0];
    if (recentDoc) {
      t.push({
        id: `read-${recentDoc.id}`,
        label: `Pick up ${recentDoc.name}`,
        meta: recentDoc.chapterMarkers?.length
          ? `${recentDoc.chapterMarkers.length} chapters`
          : recentDoc.type.toUpperCase(),
        to: `/documents/${recentDoc.id}`,
      });
    }
    for (const deck of decks.filter((d) => d.status === 'done').slice(0, 2)) {
      t.push({
        id: `deck-${deck.id}`,
        label: `Review flashcards — ${deck.title}`,
        meta: 'deck',
        to: `/flashcards/${deck.id}`,
      });
    }
    if (unclassified > 0) {
      t.push({
        id: 'classifying',
        label: `${unclassified} upload${unclassified > 1 ? 's' : ''} still classifying`,
        meta: 'in progress',
        to: '/documents',
      });
    }
    if (t.length === 0) {
      t.push({
        id: 'upload',
        label: 'Upload your first materials — a syllabus, slides or a textbook',
        meta: '2 min',
        to: '/documents',
      });
    }
    return t;
  }, [documents, decks, unclassified, overview, plan]);

  const recentDocs = documents.slice(0, 5);

  return (
    <div style={{ maxWidth: 700, padding: 'var(--space-6) var(--space-4)' }}>
      <div className="card-kicker" style={{ fontSize: 13 }}>{today}</div>
      <h1 style={{ fontSize: 32, margin: 'var(--space-1) 0 var(--space-2)' }}>Today</h1>
      <p style={{ fontSize: 15, opacity: 0.6, margin: overview ? '0 0 var(--space-2)' : '0 0 var(--space-6)' }}>
        {documents.length === 0
          ? 'Add some materials and your plan builds itself.'
          : `Your plan across ${courses.length || 'all'} course${courses.length === 1 ? '' : 's'}.`}
      </p>
      {overview && (
        <div
          className="flex flex-wrap items-baseline"
          style={{ gap: 'var(--space-3)', fontSize: 13, margin: '0 0 var(--space-6)' }}
        >
          <span style={{ opacity: 0.7 }}>
            🔥 {overview.profile.streak}-day streak · {overview.profile.xpToday}/{overview.profile.dailyGoalXp} XP today
          </span>
          <a
            className="cursor-pointer"
            style={{ color: 'var(--color-accent-700)' }}
            onClick={() => navigate('/learn')}
          >
            Learn →
          </a>
        </div>
      )}

      {/* Today's plan */}
      <div className="flex flex-col" style={{ gap: 'var(--space-4)' }}>
        {tasks.map((t) => (
          <label
            key={t.id}
            className="flex cursor-pointer items-baseline"
            style={{ gap: 12, fontSize: 16 }}
          >
            <input
              type="checkbox"
              checked={!!done[t.id]}
              onChange={() => setDone((d) => ({ ...d, [t.id]: !d[t.id] }))}
            />
            <span
              onClick={(e) => {
                e.preventDefault();
                navigate(t.to);
              }}
              style={done[t.id] ? { textDecoration: 'line-through', opacity: 0.5 } : undefined}
            >
              {t.label}
            </span>
            <span className="whitespace-nowrap" style={{ opacity: 0.5, fontSize: 13 }}>
              {done[t.id] ? 'done' : t.meta}
            </span>
          </label>
        ))}
      </div>

      {/* Recent materials */}
      {recentDocs.length > 0 && (
        <div style={{ marginTop: 'var(--space-8)' }}>
          <div
            className="flex items-baseline justify-between"
            style={{ marginBottom: 'var(--space-2)' }}
          >
            <div className="section-label">Jump back in</div>
            <a
              className="cursor-pointer"
              style={{ fontSize: 13, color: 'var(--color-accent-700)' }}
              onClick={() => navigate('/documents')}
            >
              All materials →
            </a>
          </div>
          <div className="flex flex-col">
            {recentDocs.map((doc) => (
              <div
                key={doc.id}
                onClick={() => navigate(`/documents/${doc.id}`)}
                className="grid cursor-pointer items-baseline"
                style={{
                  gridTemplateColumns: '1fr auto',
                  gap: 'var(--space-4)',
                  padding: '10px 0',
                  borderTop: '1px solid var(--color-neutral-300)',
                }}
              >
                <div style={{ fontSize: 15 }} className="min-w-0">
                  <span className="font-semibold">{doc.name}</span>{' '}
                  {doc.tags.length > 0 && (
                    <span style={{ opacity: 0.5, fontSize: 13 }}>{doc.tags.slice(0, 2).join(', ')}</span>
                  )}
                </div>
                <div className="whitespace-nowrap" style={{ fontSize: 13, opacity: 0.6 }}>
                  {doc.chapterMarkers?.length
                    ? `${doc.chapterMarkers.length} chapters`
                    : doc.type.toUpperCase()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Courses */}
      <div style={{ marginTop: 'var(--space-8)' }}>
        <div
          className="flex items-baseline justify-between"
          style={{ marginBottom: 'var(--space-2)' }}
        >
          <div className="section-label">Courses</div>
          <a
            className="cursor-pointer"
            style={{ fontSize: 13, color: 'var(--color-accent-700)' }}
            onClick={() => navigate('/courses')}
          >
            + New course
          </a>
        </div>
        {courses.length > 0 ? (
          <div className="flex flex-col">
            {courses.map((course) => (
              <div
                key={course.id}
                onClick={() => navigate(`/courses/${course.id}`)}
                className="grid cursor-pointer items-baseline"
                style={{
                  gridTemplateColumns: '1fr auto',
                  gap: 'var(--space-4)',
                  padding: '10px 0',
                  borderTop: '1px solid var(--color-neutral-300)',
                }}
              >
                <div style={{ fontSize: 15 }}>
                  <span className="font-semibold">{course.name}</span>{' '}
                  {course.description && (
                    <span style={{ opacity: 0.5, fontSize: 13 }}>{course.description}</span>
                  )}
                </div>
                <div className="whitespace-nowrap" style={{ fontSize: 13, opacity: 0.6 }}>
                  {course.documentIds.length} material{course.documentIds.length !== 1 ? 's' : ''}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            onClick={() => navigate('/courses')}
            className="cursor-pointer text-center"
            style={{
              border: '1px dashed var(--color-neutral-500)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-6)',
            }}
          >
            <div className="font-semibold" style={{ fontSize: 15, marginBottom: 2 }}>
              No courses yet
            </div>
            <div style={{ fontSize: 13, opacity: 0.6 }}>
              Name one, drop in your materials, and it's ready to study.
            </div>
          </div>
        )}
      </div>

      {/* Library strip */}
      {documents.length > 0 && (
        <div style={{ marginTop: 'var(--space-8)' }}>
          <div className="section-label">Library</div>
          <div
            className="flex"
            style={{ gap: 'var(--space-6)', marginTop: 'var(--space-3)', fontSize: 14, opacity: 0.75 }}
          >
            <span>
              <strong>{documents.length}</strong> document{documents.length !== 1 ? 's' : ''}
            </span>
            <span>
              <strong>{decks.length}</strong> deck{decks.length !== 1 ? 's' : ''}
            </span>
            <span>
              <strong>{courses.length}</strong> course{courses.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
