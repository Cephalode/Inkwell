import { create } from 'zustand';
import type { StudyGuide } from '../types/studyGuide';

/** Per-guide generation progress tracked by guide ID (for cross-component visibility). */
export interface GenerationProgress {
  status: 'idle' | 'collecting' | 'analyzing' | 'synthesizing' | 'done' | 'error';
  current: number;
  total: number;
  currentTitle: string;
  message: string;
  error: string | null;
}

interface StudyGuideState {
  guides: StudyGuide[];
  currentGuide: StudyGuide | null;
  isLoading: boolean;
  error: string | null;
  /** Live generation progress keyed by guide ID. */
  generationProgress: Record<string, GenerationProgress>;
  setGuides: (guides: StudyGuide[]) => void;
  setCurrentGuide: (guide: StudyGuide | null) => void;
  addGuide: (guide: StudyGuide) => void;
  updateGuide: (id: string, updates: Partial<StudyGuide>) => void;
  removeGuide: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setGenerationProgress: (
    id: string,
    progress: GenerationProgress | ((prev: GenerationProgress | undefined) => GenerationProgress),
  ) => void;
  clearGenerationProgress: (id: string) => void;
}

export const useStudyGuideStore = create<StudyGuideState>()((set) => ({
  guides: [],
  currentGuide: null,
  isLoading: false,
  error: null,
  generationProgress: {},

  setGuides: (guides) => set({ guides }),
  setCurrentGuide: (guide) => set({ currentGuide: guide }),
  addGuide: (guide) => set((s) => ({ guides: [guide, ...s.guides] })),
  updateGuide: (id, updates) =>
    set((s) => ({
      guides: s.guides.map((g) => (g.id === id ? { ...g, ...updates } : g)),
      currentGuide: s.currentGuide?.id === id ? { ...s.currentGuide, ...updates } : s.currentGuide,
    })),
  removeGuide: (id) =>
    set((s) => ({
      guides: s.guides.filter((g) => g.id !== id),
      currentGuide: s.currentGuide?.id === id ? null : s.currentGuide,
    })),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  setGenerationProgress: (id, progress) =>
    set((s) => {
      const prev = s.generationProgress[id];
      const next = typeof progress === 'function' ? progress(prev) : progress;
      return { generationProgress: { ...s.generationProgress, [id]: next } };
    }),
  clearGenerationProgress: (id) =>
    set((s) => {
      const next = { ...s.generationProgress };
      delete next[id];
      return { generationProgress: next };
    }),
}));
