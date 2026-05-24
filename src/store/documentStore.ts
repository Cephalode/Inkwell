import { create } from 'zustand';
import { DocumentFile } from '../types/document';

interface DocumentState {
  documents: DocumentFile[];
  isLoading: boolean;
  currentDocument: DocumentFile | null;
  setDocuments: (docs: DocumentFile[]) => void;
  addDocument: (doc: DocumentFile) => void;
  removeDocument: (id: string) => void;
  updateDocument: (id: string, updates: Partial<DocumentFile>) => void;
  setCurrentDocument: (doc: DocumentFile | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useDocumentStore = create<DocumentState>()((set) => ({
  documents: [],
  isLoading: false,
  currentDocument: null,
  setDocuments: (docs) => set({ documents: docs }),
  addDocument: (doc) => set((s) => ({ documents: [doc, ...s.documents] })),
  removeDocument: (id) => set((s) => ({ documents: s.documents.filter((d) => d.id !== id) })),
  updateDocument: (id, updates) => set((s) => ({
    documents: s.documents.map((d) => (d.id === id ? { ...d, ...updates } : d)),
  })),
  setCurrentDocument: (doc) => set({ currentDocument: doc }),
  setLoading: (loading) => set({ isLoading: loading }),
}));
