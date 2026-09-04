import type { CSSProperties } from 'react';
import { PiCardsDuotone } from 'react-icons/pi';
import { FOUNDATION_COURSE, type TopicMap, type TopicNode } from '../../types/topicMap';
import { FOUNDATION_HUE, courseHue, courseName } from '../../utils/buildTopicMap';

const MASTERY_LABEL = ['Not started', 'In progress', 'Learned', 'Foundation · assumed known'];

const dot = (hue: string, size: number): CSSProperties => ({
  width: size,
  height: size,
  borderRadius: '50%',
  background: hue,
  display: 'inline-block',
  flex: 'none',
});

interface TopicMapPanelProps {
  map: TopicMap;
  selected: TopicNode | null;
  onPick: (id: string) => void;
  onReview: (topic: TopicNode) => void;
  onOpenCourse: (topic: TopicNode) => void;
}

/** The topic map's right-hand card: overall progress, or the selected topic. */
export default function TopicMapPanel({ map, selected, onPick, onReview, onOpenCourse }: TopicMapPanelProps) {
  const courseTopics = map.topics.filter((t) => t.courseId !== FOUNDATION_COURSE);
  const learned = courseTopics.filter((t) => t.mastery === 2).length;
  const inProgress = courseTopics.filter((t) => t.mastery === 1).length;
  const foundations = map.topics.length - courseTopics.length;

  return (
    <aside
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-neutral-300)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      {!selected ? (
        <>
          <div style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', opacity: 0.55 }}>Progress</div>
          <div style={{ fontSize: 26, fontWeight: 600, lineHeight: 1 }}>
            {learned} of {courseTopics.length}
          </div>
          <div style={{ fontSize: 13, opacity: 0.6 }}>topics learned · {inProgress} in progress</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, marginTop: 2 }}>
            <span style={{ ...dot(FOUNDATION_HUE, 9), boxShadow: `0 0 6px color-mix(in srgb, ${FOUNDATION_HUE} 60%, transparent)` }} />
            {foundations} foundation{foundations === 1 ? '' : 's'} assumed by your courses
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
            {map.courses.map((c) => {
              const list = map.topics.filter((t) => t.courseId === c.id);
              const done = list.filter((t) => t.mastery === 2).length;
              return (
                <div key={c.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={dot(c.hue, 9)} />
                    {c.name}
                    <span style={{ marginLeft: 'auto', opacity: 0.55, fontSize: 12.5 }}>
                      {done} / {list.length}
                    </span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: 'var(--color-neutral-200)', marginTop: 6 }}>
                    <div style={{ height: 4, borderRadius: 2, background: c.hue, width: `${list.length ? (done / list.length) * 100 : 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 12.5, opacity: 0.5, lineHeight: 1.55, marginTop: 'var(--space-2)' }}>
            Select a topic to see what it unlocks. As you review its flashcards, learned topics join the glowing core.
          </div>
        </>
      ) : (
        <SelectedTopic map={map} topic={selected} onPick={onPick} onReview={onReview} onOpenCourse={onOpenCourse} />
      )}
    </aside>
  );
}

function SelectedTopic({
  map,
  topic,
  onPick,
  onReview,
  onOpenCourse,
}: {
  map: TopicMap;
  topic: TopicNode;
  onPick: (id: string) => void;
  onReview: (topic: TopicNode) => void;
  onOpenCourse: (topic: TopicNode) => void;
}) {
  const hue = courseHue(map, topic.courseId);
  const isFoundation = topic.courseId === FOUNDATION_COURSE;
  const byId = new Map(map.topics.map((t) => [t.id, t]));
  const connections = map.edges
    .filter((e) => e.a === topic.id || e.b === topic.id)
    .map((e) => byId.get(e.a === topic.id ? e.b : e.a))
    .filter((t): t is TopicNode => !!t);

  const masteryStyle: CSSProperties = {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    marginTop: 8,
    whiteSpace: 'nowrap',
    ...(topic.mastery === 3
      ? { background: FOUNDATION_HUE, color: '#fff', boxShadow: `0 0 10px color-mix(in srgb, ${FOUNDATION_HUE} 45%, transparent)` }
      : topic.mastery === 2
        ? { background: hue, color: '#fff' }
        : topic.mastery === 1
          ? { background: `color-mix(in srgb, ${hue} 16%, var(--color-surface))`, color: 'var(--color-text)' }
          : { border: '1.5px dashed var(--color-neutral-500)', color: 'var(--color-text)', opacity: 0.75 }),
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', opacity: 0.6 }}>
        <span style={dot(hue, 9)} />
        {courseName(map, topic.courseId)}
      </div>
      <div>
        <div style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.3 }}>{topic.label}</div>
        <span style={masteryStyle}>{MASTERY_LABEL[topic.mastery]}</span>
        <div style={{ fontSize: 12.5, opacity: 0.6, marginTop: 8 }}>
          {isFoundation ? topic.source : `From ${topic.source}${topic.cards ? ` · ${topic.cards} card${topic.cards === 1 ? '' : 's'}` : ''}`}
        </div>
        {topic.description && (
          <div style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.5, marginTop: 8 }}>{topic.description}</div>
        )}
      </div>

      <div style={{ fontSize: 11.5, letterSpacing: '.1em', textTransform: 'uppercase', opacity: 0.5, marginTop: 'var(--space-2)' }}>
        {isFoundation ? 'Unlocks' : 'Connected to'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {connections.length === 0 && (
          <div style={{ fontSize: 12.5, opacity: 0.5, padding: '2px 8px' }}>Nothing linked yet.</div>
        )}
        {connections.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPick(o.id);
            }}
            className="hover:bg-[var(--color-neutral-200)]"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              width: '100%',
              padding: '7px 8px',
              border: 'none',
              background: 'transparent',
              borderRadius: 'var(--radius-sm)',
              font: '13.5px var(--font-body)',
              color: 'var(--color-text)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={dot(courseHue(map, o.courseId), 9)} />
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11.5, opacity: 0.5, whiteSpace: 'nowrap' }}>
              {o.courseId !== topic.courseId ? courseName(map, o.courseId) : MASTERY_LABEL[o.mastery]}
            </span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'var(--space-2)' }}>
        <button type="button" className="btn btn-primary" onClick={() => onReview(topic)} style={{ width: '100%', boxSizing: 'border-box', justifyContent: 'center' }}>
          <PiCardsDuotone size={15} />
          &nbsp;{topic.cards ? `Review ${topic.cards} card${topic.cards === 1 ? '' : 's'}` : 'Make flashcards'}
        </button>
        {!isFoundation && (
          <button type="button" className="btn btn-ghost" onClick={() => onOpenCourse(topic)} style={{ width: '100%', boxSizing: 'border-box', justifyContent: 'center' }}>
            Open course
          </button>
        )}
      </div>
    </>
  );
}
