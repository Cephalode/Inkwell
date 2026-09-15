import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PiHouseDuotone,
  PiFilesDuotone,
  PiGraphDuotone,
  PiRocketLaunchDuotone,
  PiBookOpenDuotone,
  PiBookBookmarkDuotone,
  PiNotePencilDuotone,
  PiCardsDuotone,
  PiFileTextDuotone,
  PiGearDuotone,
  PiGlobeDuotone,
  PiPlusBold,
  PiMagnifyingGlassDuotone,
  PiExamDuotone,
  PiVideoDuotone,
} from 'react-icons/pi';
import type { IconType } from 'react-icons';
import { useUIStore } from '../../store/uiStore';
import { useCourseStore } from '../../store/courseStore';
import { useDocumentStore } from '../../store/documentStore';
import { useFlashcardStore } from '../../store/flashcardStore';
import { useStudyGuideStore } from '../../store/studyGuideStore';
import { usePracticeTestStore } from '../../store/practiceTestStore';
import { useCourses } from '../../hooks/useCourses';

interface Result {
  icon: IconType;
  title: string;
  sub: string;
  to: string;
}

interface Group {
  label: string;
  items: Result[];
}

/** ⌘K search across courses, materials, decks, guides and tests. */
export default function CommandPalette() {
  const navigate = useNavigate();
  const { activeModal, openModal, closeModal } = useUIStore();
  const open = activeModal === 'command-palette';
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const courses = useCourseStore((s) => s.courses);
  const documents = useDocumentStore((s) => s.documents);
  const decks = useFlashcardStore((s) => s.decks);
  const guides = useStudyGuideStore((s) => s.guides);
  const tests = usePracticeTestStore((s) => s.tests);
  const fetchDecks = useFlashcardStore((s) => s.fetchDecks);
  const fetchTests = usePracticeTestStore((s) => s.fetchTests);
  const { loadCourses } = useCourses();

  // Global ⌘K / Ctrl+K toggle
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (useUIStore.getState().activeModal === 'command-palette') {
          setQ('');
          closeModal();
        } else {
          openModal('command-palette');
        }
      } else if (e.key === 'Escape' && useUIStore.getState().activeModal === 'command-palette') {
        setQ('');
        closeModal();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openModal, closeModal]);

  // Hydrate searchable data + focus on open
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    loadCourses();
    fetchDecks().catch(() => {});
    fetchTests().catch(() => {});
  }, [open, loadCourses, fetchDecks, fetchTests]);

  const groups: Group[] = useMemo(() => {
    const query = q.trim().toLowerCase();
    const courseName = (id?: string) => courses.find((c) => c.id === id)?.name ?? '';

    if (!query) {
      return [
        {
          label: 'Go to',
          items: [
            { icon: PiHouseDuotone, title: 'Home', sub: 'Today & recent work', to: '/' },
            { icon: PiFilesDuotone, title: 'Documents', sub: 'All materials', to: '/documents' },
            { icon: PiGraphDuotone, title: 'Topic map', sub: 'Topics across courses', to: '/topic-map' },
            { icon: PiRocketLaunchDuotone, title: 'Learn', sub: 'Roadmaps, XP & streak', to: '/learn' },
            { icon: PiVideoDuotone, title: 'Videos', sub: 'Best videos for your milestones', to: '/learn/videos' },
            { icon: PiBookOpenDuotone, title: 'Textbook', sub: 'Reader', to: '/textbook' },
            ...courses.map((c) => ({
              icon: PiBookBookmarkDuotone,
              title: c.name,
              sub: c.description || 'Course',
              to: `/courses/${c.id}`,
            })),
            { icon: PiCardsDuotone, title: 'Flashcards', sub: 'All decks', to: '/flashcards' },
            { icon: PiNotePencilDuotone, title: 'Study guides', sub: 'All guides', to: '/study-guides' },
            { icon: PiExamDuotone, title: 'Practice tests', sub: 'All tests', to: '/tests' },
            { icon: PiGlobeDuotone, title: 'Coursera', sub: 'Linked coursework', to: '/coursera' },
            { icon: PiPlusBold, title: 'New course', sub: 'Create or import', to: '/courses' },
            { icon: PiGearDuotone, title: 'Settings', sub: 'AI, theme & accounts', to: '/settings' },
          ],
        },
      ];
    }

    const hit = (...fields: Array<string | undefined>) =>
      fields.some((f) => (f || '').toLowerCase().includes(query));

    return [
      {
        label: 'Courses',
        items: courses
          .filter((c) => hit(c.name, c.description))
          .map((c) => ({
            icon: PiBookBookmarkDuotone,
            title: c.name,
            sub: c.description || 'Course',
            to: `/courses/${c.id}`,
          })),
      },
      {
        label: 'Materials',
        items: documents
          .filter((d) => hit(d.name, ...(d.tags ?? [])))
          .map((d) => ({
            icon: PiFileTextDuotone,
            title: d.name,
            sub: d.type.toUpperCase(),
            to: `/documents/${d.id}`,
          })),
      },
      {
        label: 'Flashcards',
        items: decks
          .filter((d) => hit(d.title, d.description))
          .map((d) => ({
            icon: PiCardsDuotone,
            title: d.title,
            sub: courseName(d.course_id) || 'Deck',
            to: `/flashcards/${d.id}`,
          })),
      },
      {
        label: 'Study guides',
        items: guides
          .filter((g) => hit(g.title))
          .map((g) => ({
            icon: PiNotePencilDuotone,
            title: g.title,
            sub: 'Study guide',
            to: `/study-guides/${g.id}`,
          })),
      },
      {
        label: 'Practice tests',
        items: tests
          .filter((t) => hit(t.title, t.description))
          .map((t) => ({
            icon: PiExamDuotone,
            title: t.title,
            sub: courseName(t.course_id) || 'Test',
            to: `/tests/${t.id}`,
          })),
      },
    ]
      .map((g) => ({ ...g, items: g.items.slice(0, 5) }))
      .filter((g) => g.items.length > 0);
  }, [q, courses, documents, decks, guides, tests]);

  if (!open) return null;

  const dismiss = () => {
    setQ('');
    closeModal();
  };
  const pick = (to: string) => {
    dismiss();
    navigate(to);
  };
  const firstResult = groups[0]?.items[0];

  return (
    <div
      onClick={dismiss}
      className="fixed inset-0 z-50 flex items-start justify-center"
      style={{ background: 'rgba(26,20,18,.35)', paddingTop: '12vh' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="overflow-hidden"
        style={{
          width: 580,
          maxWidth: '90vw',
          background: 'var(--color-bg)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 18px 60px rgba(0,0,0,.28)',
        }}
      >
        <div
          className="flex items-center gap-2.5"
          style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-neutral-300)' }}
        >
          <PiMagnifyingGlassDuotone size={18} style={{ color: 'var(--color-accent)', flex: 'none' }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && firstResult) pick(firstResult.to);
            }}
            placeholder="Search courses, materials, decks, guides…"
            className="flex-1 border-none outline-none bg-transparent"
            style={{ font: '16px var(--font-body)', color: 'var(--color-text)' }}
          />
          <span
            style={{
              fontSize: 11,
              opacity: 0.4,
              border: '1px solid var(--color-neutral-400)',
              borderRadius: 4,
              padding: '2px 6px',
            }}
          >
            esc
          </span>
        </div>
        <div style={{ maxHeight: 400, overflowY: 'auto', padding: 8 }}>
          {groups.map((grp) => (
            <div key={grp.label} style={{ padding: '4px 0' }}>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  opacity: 0.45,
                  padding: '4px 10px',
                }}
              >
                {grp.label}
              </div>
              {grp.items.map((r) => (
                <button
                  key={r.to + r.title}
                  onClick={() => pick(r.to)}
                  className="flex w-full cursor-pointer items-center text-left transition-colors hover:bg-[var(--color-neutral-200)]"
                  style={{
                    gap: 11,
                    padding: '9px 10px',
                    border: 'none',
                    background: 'transparent',
                    borderRadius: 'var(--radius-sm)',
                    font: '14px var(--font-body)',
                    color: 'var(--color-text)',
                  }}
                >
                  <r.icon size={17} style={{ color: 'var(--color-accent)', flex: 'none' }} />
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{r.title}</span>
                  <span
                    className="ml-auto whitespace-nowrap"
                    style={{ fontSize: 12, opacity: 0.5, flex: 'none' }}
                  >
                    {r.sub}
                  </span>
                </button>
              ))}
            </div>
          ))}
          {groups.length === 0 && q.trim() && (
            <div style={{ padding: '24px 10px', textAlign: 'center', fontSize: 14, opacity: 0.5 }}>
              No matches for “{q}”
            </div>
          )}
        </div>
        <div
          className="flex"
          style={{
            gap: 14,
            padding: '9px 16px',
            borderTop: '1px solid var(--color-neutral-300)',
            fontSize: 11.5,
            opacity: 0.45,
          }}
        >
          <span>↵ open first result</span>
          <span>esc close</span>
          <span>⌘K toggle</span>
        </div>
      </div>
    </div>
  );
}
