import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { PiGraphDuotone } from 'react-icons/pi';
import TopicMapCanvas from '../components/topicMap/TopicMapCanvas';
import TopicMapPanel from '../components/topicMap/TopicMapPanel';
import EmptyState from '../components/shared/EmptyState';
import Spinner from '../components/shared/Spinner';
import { useCourses } from '../hooks/useCourses';
import { useIsMobile } from '../hooks/useIsMobile';
import { useFlashcardStore } from '../store/flashcardStore';
import { getStudyGuide, listStudyGuides } from '../services/api/client';
import { buildTopicMap, FOUNDATION_HUE } from '../utils/buildTopicMap';
import type { StudyGuide } from '../types/studyGuide';
import type { TopicNode } from '../types/topicMap';

const swatch = (hue: string, size: number): CSSProperties => ({
  width: size,
  height: size,
  borderRadius: '50%',
  background: hue,
  display: 'inline-block',
  flex: 'none',
});

/** Topic map — the Study Desk prototype's cross-course map, built from study-guide
 *  concept roadmaps, their prerequisites (the green core) and flashcard reviews (mastery). */
export default function TopicMapPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { courses, loadCourses } = useCourses();
  const decks = useFlashcardStore((s) => s.decks);
  const cardsByDeckId = useFlashcardStore((s) => s.cardsByDeckId);
  const fetchDecks = useFlashcardStore((s) => s.fetchDecks);
  const fetchCards = useFlashcardStore((s) => s.fetchCards);

  const [guides, setGuides] = useState<StudyGuide[] | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const requestedCards = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    loadCourses().catch(console.error);
    fetchDecks().catch(() => {});
    (async () => {
      try {
        const list = await listStudyGuides();
        const full = await Promise.all(
          list.filter((g) => g.status === 'done').map((g) => getStudyGuide(g.id).catch(() => null)),
        );
        if (!cancelled) setGuides(full.filter((g): g is StudyGuide => !!g));
      } catch (err) {
        console.error(err);
        if (!cancelled) setGuides([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCourses, fetchDecks]);

  useEffect(() => {
    for (const deck of decks) {
      if (deck.status !== 'done' || cardsByDeckId[deck.id] || requestedCards.current.has(deck.id)) continue;
      requestedCards.current.add(deck.id);
      fetchCards(deck.id).catch(() => {});
    }
  }, [decks, cardsByDeckId, fetchCards]);

  const map = useMemo(
    () => buildTopicMap(courses, guides ?? [], decks, cardsByDeckId),
    [courses, guides, decks, cardsByDeckId],
  );
  const selected = useMemo(
    () => (selectedId ? map.topics.find((t) => t.id === selectedId) ?? null : null),
    [map.topics, selectedId],
  );

  const toggleCourse = useCallback(
    (courseId: string) => {
      setHidden((prev) => {
        const next = new Set(prev);
        if (next.has(courseId)) next.delete(courseId);
        else next.add(courseId);
        return next;
      });
      setSelectedId((sel) => {
        const t = sel ? map.topics.find((x) => x.id === sel) : null;
        return t && t.courseId === courseId && !hidden.has(courseId) ? null : sel;
      });
    },
    [map.topics, hidden],
  );

  const handleReview = useCallback(
    (topic: TopicNode) => navigate(topic.cards && topic.deckId ? `/flashcards/${topic.deckId}` : '/flashcards'),
    [navigate],
  );
  const handleOpenCourse = useCallback((topic: TopicNode) => navigate(`/courses/${topic.courseId}`), [navigate]);

  const legend: Array<{ label: string; swatch: CSSProperties }> = [
    {
      label: 'Foundation — assumed known',
      swatch: {
        ...swatch(`color-mix(in srgb, ${FOUNDATION_HUE} 70%, #fff)`, 13),
        boxSizing: 'border-box',
        border: `2px solid color-mix(in srgb, ${FOUNDATION_HUE} 45%, #14251a)`,
      },
    },
    {
      label: 'Learned — course topic (ring = its class)',
      swatch: {
        ...swatch(`color-mix(in srgb, ${FOUNDATION_HUE} 70%, #fff)`, 13),
        boxSizing: 'border-box',
        boxShadow: `0 0 0 3px color-mix(in srgb, ${map.courses[0]?.hue ?? '#2380a2'} 40%, transparent)`,
      },
    },
    { label: 'Filled = in progress · dashed = up next', swatch: { display: 'none' } },
    ...map.courses.map((c) => ({ label: c.name, swatch: swatch(c.hue, 11) })),
    {
      label: 'Dashed link = crosses courses',
      swatch: {
        width: 22,
        height: 2,
        background: 'repeating-linear-gradient(90deg, var(--color-neutral-500) 0 5px, transparent 5px 9px)',
        display: 'inline-block',
        flex: 'none',
      },
    },
  ];

  const loading = guides === null;
  const empty = !loading && map.topics.length === 0;

  return (
    <div style={{ maxWidth: 1080, padding: isMobile ? 0 : 'var(--space-6) var(--space-4)', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div>
          <div className="card-kicker">All courses</div>
          <h1 style={{ fontSize: 32, margin: 'var(--space-1) 0 var(--space-2)' }}>Topic map</h1>
          <p style={{ fontSize: 15, opacity: 0.6, margin: 0 }}>
            The green core is what your courses assume you already know — branches map what each course asks you to learn next.
          </p>
        </div>
        {map.courses.length > 0 && (
          <div style={{ display: 'inline-flex', flex: 'none', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, letterSpacing: '.08em', textTransform: 'uppercase', opacity: 0.5, fontWeight: 600, marginRight: 2 }}>
              Show
            </span>
            {map.courses.map((c) => {
              const on = !hidden.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleCourse(c.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    font: '600 12px var(--font-body)',
                    padding: '5px 12px',
                    borderRadius: 999,
                    cursor: 'pointer',
                    color: 'var(--color-text)',
                    border: `1px solid ${on ? `color-mix(in srgb, ${c.hue} 45%, var(--color-neutral-300))` : 'var(--color-neutral-300)'}`,
                    background: on ? `color-mix(in srgb, ${c.hue} 10%, var(--color-surface))` : 'var(--color-surface)',
                    opacity: on ? 1 : 0.5,
                    transition: 'opacity .15s',
                  }}
                >
                  <span style={swatch(on ? c.hue : 'var(--color-neutral-400)', 9)} />
                  {c.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : empty ? (
        <EmptyState
          icon={<PiGraphDuotone />}
          title="No topic map yet"
          description="Generate a study guide for a course — its concept roadmap becomes the map, and reviewing flashcards fills it in."
          action={{ label: 'Go to study guides', onClick: () => navigate('/study-guides') }}
        />
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-5)',
              alignItems: 'center',
              flexWrap: 'wrap',
              margin: 'var(--space-4) 0 var(--space-3)',
              fontSize: 12.5,
              opacity: 0.8,
            }}
          >
            {legend.map((lg) => (
              <span key={lg.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginRight: 22, whiteSpace: 'nowrap' }}>
                <span style={lg.swatch} />
                {lg.label}
              </span>
            ))}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(560px, 1fr) 250px',
              gap: 'var(--space-4)',
              alignItems: 'stretch',
              overflowX: isMobile ? 'visible' : 'auto',
              paddingBottom: 'var(--space-2)',
            }}
          >
            <TopicMapCanvas
              map={map}
              hidden={hidden}
              selectedId={selected?.id ?? null}
              onSelect={setSelectedId}
              height={isMobile ? 440 : 560}
            />
            <TopicMapPanel
              map={map}
              selected={selected}
              onPick={setSelectedId}
              onReview={handleReview}
              onOpenCourse={handleOpenCourse}
            />
          </div>
        </>
      )}
    </div>
  );
}
