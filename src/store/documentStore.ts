import { create } from 'zustand';
import { DocumentFile } from '../types/document';

/**
 * Chapter info lifted into the store so the chatbot / agent can read which
 * chapter the student currently has open, without reaching into page state.
 */
export interface CurrentChapter {
  id: string;
  title: string;
  parentId: string;
  textbookId?: string;
}

interface DocumentState {
  documents: DocumentFile[];
  isLoading: boolean;
  currentDocument: DocumentFile | null;
  /** The chapter the student currently has open in the textbook viewer. */
  currentChapter: CurrentChapter | null;
  currentChapterId: string | null;
  /** Parsed text content of the currently open chapter, when available.
   *  Lifted into the store so the chat agent can read what's on screen
   *  without needing a tool call (Cursor-style proactive context). */
  currentChapterText: string | null;
  /** Current page within the open chapter (1-indexed). */
  viewerPage: number;
  setDocuments: (docs: DocumentFile[]) => void;
  addDocument: (doc: DocumentFile) => void;
  removeDocument: (id: string) => void;
  updateDocument: (id: string, updates: Partial<DocumentFile>) => void;
  setCurrentDocument: (doc: DocumentFile | null) => void;
  setLoading: (loading: boolean) => void;
  setCurrentChapter: (chapter: CurrentChapter | null) => void;
  setChapterText: (text: string | null) => void;
  setViewerPage: (page: number) => void;
  clearCurrentChapter: () => void;
}

export const useDocumentStore = create<DocumentState>()((set) => ({
  documents: [],
  isLoading: false,
  currentDocument: null,
  currentChapter: null,
  currentChapterId: null,
  currentChapterText: null,
  viewerPage: 1,
  setDocuments: (docs) => set({ documents: docs }),
  addDocument: (doc) => set((s) => ({ documents: [doc, ...s.documents] })),
  removeDocument: (id) => set((s) => ({ documents: s.documents.filter((d) => d.id !== id) })),
  updateDocument: (id, updates) => set((s) => ({
    documents: s.documents.map((d) => (d.id === id ? { ...d, ...updates } : d)),
  })),
  setCurrentDocument: (doc) => set({ currentDocument: doc }),
  setLoading: (loading) => set({ isLoading: loading }),
  // Selecting a new chapter resets the viewer page to 1 and keeps the id in sync.
  setCurrentChapter: (chapter) => set({
    currentChapter: chapter,
    currentChapterId: chapter ? chapter.id : null,
    viewerPage: chapter ? 1 : 1,
  }),
  setChapterText: (text) => set({ currentChapterText: text && text.length > 0 ? text : null }),
  setViewerPage: (page) => set({ viewerPage: page }),
  clearCurrentChapter: () => set({ currentChapter: null, currentChapterId: null, currentChapterText: null, viewerPage: 1 }),
}));
