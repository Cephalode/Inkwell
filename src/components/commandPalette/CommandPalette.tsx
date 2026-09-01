import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCommandPaletteStore } from '../../store/commandPaletteStore';
import { useCourseStore } from '../../store/courseStore';
import { useFlashcardStore } from '../../store/flashcardStore';

interface PaletteItem {
  id: string;
  group: 'Go to' | 'Courses' | 'Actions' | 'Notes';
  label: string;
  sub?: string;
  run: () => void;
}

/** Lowercase substring fuzzy match: item matches if any field contains the query. */
const hit = (q: string, ...fields: (string | undefined)[]) =>
  fields.some((x) => (x || '').toLowerCase().includes(q));

/** Defensive notes-store read: resolves to [] on any failure, never breaks the palette. */
async function loadNotes(): Promise<Array<{ id: string; title?: string }>> {
  try {
    const mod = await import('../../store/notesStore');
    const notes = mod.useNotesStore?.getState?.().notes;
    return Array.isArray(notes) ? notes : [];
  } catch {
    return [];
  }
}

const GROUP_ORDER: PaletteItem['group'][] = ['Go to', 'Courses', 'Actions', 'Notes'];

export default function CommandPalette() {
  const isOpen = useCommandPaletteStore((s) => s.isOpen);
  const toggle = useCommandPaletteStore((s) => s.toggle);

  // Global ⌘K / Ctrl+K toggle — registered here so the orchestrator only
  // mounts <CommandPalette /> once and never wires keys itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  // Inner content mounts only while open, so query state resets on each open.
  if (!isOpen) return null;
  return <PaletteContent />;
}

function PaletteContent() {
  const navigate = useNavigate();
  const close = useCommandPaletteStore((s) => s.close);
  const [query, setQuery] = useState('');
  const [noteItems, setNoteItems] = useState<PaletteItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Defensive dynamic import of the parallel-built notes store; any failure
  // (module missing, store shape off) resolves to [] — palette keeps working.
  useEffect(() => {
    let cancelled = false;
    loadNotes()
      .then((notes) => {
        if (cancelled || notes.length === 0) return;
        setNoteItems(
          notes.map((n) => ({
            id: `note-${n.id}`,
            group: 'Notes' as const,
            label: n.title || 'Untitled note',
            sub: 'Note',
            run: () => navigate('/notes'),
          })),
        );
      })
      .catch(() => []);
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // Snapshot reads (getState) — rebuilt when query changes so data stays fresh
  // per keystroke without subscribing to the stores.
  const items = useMemo<PaletteItem[]>(() => {
    const courses = useCourseStore.getState().courses;
    const decks = useFlashcardStore.getState().decks;

    const goTo: PaletteItem[] = [
      { id: 'go-home', group: 'Go to', label: 'Home', run: () => navigate('/') },
      // Topic map lives on DocumentsPage behind the list/graph view toggle
      // (DocumentsPage.tsx:37); it has no dedicated route/anchor, so we land
      // on /documents where the user flips to graph view.
      {
        id: 'go-topic-map',
        group: 'Go to',
        label: 'Topic map',
        sub: 'Documents · graph view',
        run: () => navigate('/documents'),
      },
      { id: 'go-deadlines', group: 'Go to', label: 'Deadlines', run: () => navigate('/deadlines') },
      { id: 'go-notes', group: 'Go to', label: 'Notes', run: () => navigate('/notes') },
      { id: 'go-flashcards', group: 'Go to', label: 'Flashcards', run: () => navigate('/flashcards') },
      { id: 'go-settings', group: 'Go to', label: 'Settings', run: () => navigate('/settings') },
    ];

    const courseItems: PaletteItem[] = courses.map((c) => {
      const docCount = (c.documentIds ?? []).length;
      return {
        id: `course-${c.id}`,
        group: 'Courses' as const,
        label: c.name,
        sub: `${docCount} ${docCount === 1 ? 'document' : 'documents'}`,
        run: () => navigate(`/courses/${c.id}`),
      };
    });

    const actions: PaletteItem[] = [
      {
        id: 'action-new-course',
        group: 'Actions',
        label: 'New course',
        sub: 'Courses page',
        run: () => navigate('/courses'),
      },
      {
        id: 'action-make-flashcard',
        group: 'Actions',
        label: 'Make flashcard',
        sub: 'Flashcards page',
        run: () => navigate('/flashcards'),
      },
    ];

    const deckItems: PaletteItem[] = decks.map((d) => ({
      id: `deck-${d.id}`,
      group: 'Notes' as const,
      label: d.title,
      sub: 'Flashcard deck',
      run: () => navigate(`/flashcards/${d.id}`),
    }));

    return [...goTo, ...courseItems, ...actions, ...deckItems];
    // `query` in deps is intentional: it re-runs the getState() snapshots so
    // the list refreshes as the user types.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, navigate]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () => items.filter((it) => hit(q, it.label, it.sub)),
    [items, q],
  );
  const visibleNotes = useMemo(
    () => noteItems.filter((it) => hit(q, it.label, it.sub)),
    [noteItems, q],
  );

  const grouped = useMemo(() => {
    const all = [...visible, ...visibleNotes];
    const byGroup = new Map<PaletteItem['group'], PaletteItem[]>();
    for (const g of GROUP_ORDER) byGroup.set(g, []);
    for (const it of all) byGroup.get(it.group)?.push(it);
    return GROUP_ORDER.map((g) => ({ group: g, items: byGroup.get(g) ?? [] })).filter(
      (g) => g.items.length > 0,
    );
  }, [visible, visibleNotes]);

  const firstVisible: PaletteItem | undefined = grouped.flatMap((g) => g.items)[0];

  const pick = (it: PaletteItem) => {
    close();
    it.run();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="w-[580px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              close();
            } else if (e.key === 'Enter' && firstVisible) {
              e.preventDefault();
              pick(firstVisible);
            }
          }}
          placeholder="Search commands, courses, notes…"
          className="w-full border-b border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
        />
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {grouped.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-slate-500">No results</div>
          )}
          {grouped.map(({ group, items: groupItems }) => (
            <div key={group}>
              <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {group}
              </div>
              {groupItems.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => pick(it)}
                  className="flex w-full items-baseline justify-between gap-3 px-4 py-2 text-left hover:bg-slate-100"
                >
                  <span className="truncate text-sm text-slate-800">{it.label}</span>
                  {it.sub && <span className="shrink-0 text-xs text-slate-400">{it.sub}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-[11px] text-slate-400">
          <span>↵ open first result</span>
          <span>esc close · ⌘K toggle</span>
        </div>
      </div>
    </div>
  );
}
