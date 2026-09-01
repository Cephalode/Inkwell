import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  HiChevronRight,
  HiDocumentText,
  HiOutlineTrash,
  HiOutlinePencilSquare,
} from 'react-icons/hi2';
import { useCourseStore } from '../store/courseStore';
import { useNotesStore, notesByCourse, type NoteFile } from '../store/notesStore';

/** Wrap the textarea selection between pre/suf, restoring focus + cursor. */
function useSelectionWrap(taRef: React.RefObject<HTMLTextAreaElement | null>) {
  return (pre: string, suf: string, ph: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const a = ta.selectionStart;
    const b = ta.selectionEnd;
    const v = ta.value;
    const sel = v.slice(a, b) || ph;
    const next = v.slice(0, a) + pre + sel + suf + v.slice(b);
    const cursor = a + pre.length + sel.length + suf.length;
    ta.value = next;
    ta.focus();
    ta.setSelectionRange(cursor, cursor);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  };
}

function formatSavedHint(updatedAt: number): string {
  const diff = Date.now() - updatedAt;
  if (diff < 15_000) return 'Saved · just now';
  if (diff < 60_000) return `Saved · ${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `Saved · ${Math.floor(diff / 60_000)}m ago`;
  return `Saved · ${new Date(updatedAt).toLocaleString()}`;
}

const TOOLBAR_BUTTON =
  'px-2 py-1 rounded text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] transition-colors';

/** Editor for a single note. Keyed by note.id upstream so drafts re-seed
 *  from the note on every file switch — no cross-render syncing needed. */
function NoteEditor({
  note,
  updateNote,
  onRequestDelete,
}: {
  note: NoteFile;
  updateNote: (id: string, patch: { title: string; body: string }) => void;
  onRequestDelete: () => void;
}) {
  const [draftTitle, setDraftTitle] = useState(note.title);
  const [draftBody, setDraftBody] = useState(note.body);
  const [showPreview, setShowPreview] = useState(false);
  const [savedTick, setSavedTick] = useState(0);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const wrap = useSelectionWrap(taRef);
  const pendingRef = useRef<{ title: string; body: string } | null>(null);

  // Debounced auto-save (800ms)
  useEffect(() => {
    const dirty = draftTitle !== note.title || draftBody !== note.body;
    pendingRef.current = dirty ? { title: draftTitle, body: draftBody } : null;
    if (!dirty) return;
    const t = setTimeout(() => {
      updateNote(note.id, { title: draftTitle, body: draftBody });
      pendingRef.current = null;
      setSavedTick((v) => v + 1);
    }, 800);
    return () => clearTimeout(t);
  }, [draftTitle, draftBody, note, updateNote]);

  // Flush any pending save on unmount (switching files / leaving the page)
  useEffect(
    () => () => {
      if (pendingRef.current) updateNote(note.id, { ...pendingRef.current });
    },
    [note.id, updateNote]
  );

  const handleHeading = () => {
    const ta = taRef.current;
    if (!ta) return;
    const a = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf('\n', a - 1) + 1;
    ta.focus();
    ta.setSelectionRange(lineStart, lineStart);
    wrap('## ', '', '');
  };

  const handleList = () => {
    const ta = taRef.current;
    if (!ta) return;
    const a = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf('\n', a - 1) + 1;
    ta.focus();
    ta.setSelectionRange(lineStart, lineStart);
    wrap('- ', '', '');
  };

  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="Note title"
            className="min-w-0 flex-1 bg-transparent font-serif text-xl font-semibold text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-secondary)]"
          />
          <span
            key={savedTick}
            className="shrink-0 text-xs text-[var(--color-text-secondary)]"
          >
            {formatSavedHint(note.updatedAt)}
          </span>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1 border-b border-[var(--color-border)] px-3 py-1.5">
          <button className={TOOLBAR_BUTTON} onClick={() => wrap('**', '**', 'bold text')} title="Bold">B</button>
          <button className={`${TOOLBAR_BUTTON} italic`} onClick={() => wrap('*', '*', 'italic text')} title="Italic">I</button>
          <button className={TOOLBAR_BUTTON} onClick={() => wrap('`', '`', 'code')} title="Code">{'</>'}</button>
          <button className={TOOLBAR_BUTTON} onClick={() => wrap('[', '](url)', 'link text')} title="Link">Link</button>
          <button className={TOOLBAR_BUTTON} onClick={handleHeading} title="Heading">H2</button>
          <button className={TOOLBAR_BUTTON} onClick={handleList} title="List">• List</button>
          <div className="ml-auto flex items-center gap-1 rounded-md border border-[var(--color-border)] p-0.5">
            <button
              onClick={() => setShowPreview(false)}
              className={`rounded px-2 py-0.5 text-xs ${!showPreview ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'}`}
            >
              Write
            </button>
            <button
              onClick={() => setShowPreview(true)}
              className={`rounded px-2 py-0.5 text-xs ${showPreview ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'}`}
            >
              Preview
            </button>
            <button
              onClick={onRequestDelete}
              className="rounded px-2 py-0.5 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
              title="Delete note"
            >
              <HiOutlineTrash className="h-3.5 w-3.5" />
            </button>
            <HiOutlinePencilSquare className="ml-1 h-3.5 w-3.5 text-[var(--color-text-secondary)]" />
          </div>
        </div>

        {showPreview ? (
          <div className="prose-invert flex-1 overflow-y-auto px-6 py-4 text-[var(--color-text)]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{draftBody || '*Nothing to preview yet.*'}</ReactMarkdown>
          </div>
        ) : (
          <textarea
            ref={taRef}
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            placeholder="Start writing… (markdown supported)"
            className="flex-1 resize-none bg-transparent px-6 py-4 font-mono text-sm leading-relaxed text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-secondary)]"
          />
        )}
      </div>
    </div>
  );
}

export default function NotesPage() {
  const courses = useCourseStore((s) => s.courses);
  const notes = useNotesStore((s) => s.notes);
  const createNote = useNotesStore((s) => s.createNote);
  const updateNote = useNotesStore((s) => s.updateNote);
  const deleteNote = useNotesStore((s) => s.deleteNote);

  const [searchParams, setSearchParams] = useSearchParams();
  const courseParam = searchParams.get('course');

  // Persist store is synchronous — notes exist at first render, so the
  // ?course= preselect can happen in lazy initializers (no effects needed).
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    courseParam ? notes.find((n) => n.courseId === courseParam)?.id ?? null : null
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    courseParam ? { [courseParam]: false } : {}
  );
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const notesForCourse = useMemo(
    () => (courseId: string) => notesByCourse(courseId)({ notes }),
    [notes]
  );

  const selected = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId]
  );

  const handleSelect = (note: NoteFile) => {
    setSelectedId(note.id);
    if (note.courseId && note.courseId !== courseParam) {
      setSearchParams({ course: note.courseId }, { replace: true });
    }
  };

  const handleNew = (courseId: string) => {
    const note = createNote(courseId);
    setCollapsed((c) => ({ ...c, [courseId]: false }));
    setSelectedId(note.id);
    setSearchParams({ course: courseId }, { replace: true });
  };

  const handleDelete = (id: string) => {
    deleteNote(id);
    setConfirmDelete(null);
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left column: per-course folder tree */}
      <aside className="w-64 shrink-0 overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
        <h1 className="mb-3 px-1 font-serif text-lg font-semibold tracking-tight text-[var(--color-text)]">
          Notes
        </h1>
        {courses.length === 0 && (
          <p className="px-1 text-xs text-[var(--color-text-secondary)]">
            No courses yet — create a course first, then add notes to it.
          </p>
        )}
        {courses.map((course) => {
          const courseNotes = notesForCourse(course.id);
          const isCollapsed = collapsed[course.id] ?? courseNotes.length === 0;
          return (
            <div key={course.id} className="mb-1">
              <button
                onClick={() =>
                  setCollapsed((c) => ({ ...c, [course.id]: !isCollapsed }))
                }
                className="flex w-full items-center gap-1 rounded px-1 py-1.5 text-left text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-hover)]"
              >
                <HiChevronRight
                  className={`h-3.5 w-3.5 shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                />
                <span className="truncate">{course.name}</span>
                <span className="ml-auto text-xs text-[var(--color-text-secondary)]">
                  {courseNotes.length}
                </span>
              </button>
              {!isCollapsed && (
                <div className="ml-4 border-l border-[var(--color-border)] pl-2">
                  {courseNotes.map((note) => (
                    <button
                      key={note.id}
                      onClick={() => handleSelect(note)}
                      className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                        selectedId === note.id
                          ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]'
                      }`}
                    >
                      <HiDocumentText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{note.title || 'Untitled note'}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => handleNew(course.id)}
                    className="mt-1 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]"
                  >
                    + new note
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </aside>

      {/* Middle: editor / Right: preview */}
      {selected ? (
        <NoteEditor
          key={selected.id}
          note={selected}
          updateNote={updateNote}
          onRequestDelete={() => setConfirmDelete(selected.id)}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[var(--color-text-secondary)]">
          <HiDocumentText className="h-10 w-10 opacity-50" />
          <p className="text-sm">Select a note from the left, or create one with “+ new note”.</p>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="w-80 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-serif text-lg font-semibold text-[var(--color-text)]">Delete note?</h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              “{notes.find((n) => n.id === confirmDelete)?.title || 'Untitled note'}” will be permanently removed.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded-md px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmDelete && handleDelete(confirmDelete)}
                className="rounded-md bg-[var(--color-danger)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
