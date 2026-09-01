import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface NoteFile {
  id: string;
  courseId: string;
  title: string;
  body: string; // markdown
  createdAt: number;
  updatedAt: number;
}

interface NotesState {
  notes: NoteFile[];
  createNote: (courseId: string, title?: string) => NoteFile;
  updateNote: (id: string, updates: Partial<Pick<NoteFile, 'title' | 'body' | 'courseId'>>) => void;
  deleteNote: (id: string) => void;
}

export const useNotesStore = create<NotesState>()(
  persist(
    (set) => ({
      notes: [],

      createNote: (courseId, title = 'Untitled note') => {
        const now = Date.now();
        const note: NoteFile = {
          id: `note-${now}-${Math.random().toString(36).slice(2, 8)}`,
          courseId,
          title,
          body: '',
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ notes: [note, ...s.notes] }));
        return note;
      },

      updateNote: (id, updates) =>
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n
          ),
        })),

      deleteNote: (id) =>
        set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
    }),
    { name: 'inkwell-notes' }
  )
);

/** Selector: all notes belonging to a course, newest-updated first. */
export const notesByCourse = (courseId: string) => (state: { notes: NoteFile[] }) =>
  state.notes
    .filter((n) => n.courseId === courseId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
