import { create } from 'zustand';
import type {
  PracticeTest,
  GenerationProgress,
  TestAttemptResult,
  TestAttempt,
  TestQuestion,
} from '../types/practiceTest';
import * as api from '../services/api/client';
import { consumeSSE } from '../utils/sse';

interface PracticeTestState {
  tests: PracticeTest[];
  testDetailsById: Record<string, PracticeTest & { questions: TestQuestion[] }>;
  generationProgress: Record<string, GenerationProgress>;
  testAttempts: Record<string, Array<Omit<TestAttempt, 'answers'>>>;

  // Actions
  fetchTests: () => Promise<void>;
  fetchTest: (testId: string, reveal?: boolean) => Promise<void>;
  createTest: (params: {
    title: string;
    description?: string;
    course_id?: string;
    source: { type: 'course' | 'document' | 'chapter'; ids: string[] };
    config: { numQuestions?: number; types?: string[] };
  }) => Promise<PracticeTest>;
  generateTest: (testId: string, signal?: AbortSignal) => Promise<void>;
  submitAttempt: (
    testId: string,
    answers: Record<string, string | number | boolean>
  ) => Promise<TestAttemptResult>;
  fetchAttempts: (testId: string) => Promise<void>;
  deleteTest: (testId: string) => Promise<void>;
  setGenerationProgress: (testId: string, progress: GenerationProgress) => void;
  clearGenerationProgress: (testId: string) => void;
}

export const usePracticeTestStore = create<PracticeTestState>((set, get) => ({
  tests: [],
  testDetailsById: {},
  generationProgress: {},
  testAttempts: {},

  fetchTests: async () => {
    try {
      const tests = await api.listPracticeTests();
      set({ tests });
    } catch (error) {
      console.error('Error fetching practice tests:', error);
    }
  },

  fetchTest: async (testId: string, reveal?: boolean) => {
    try {
      const test = await api.getPracticeTest(testId, reveal);
      set((state) => ({
        tests: state.tests.some((t) => t.id === testId)
          ? state.tests.map((t) => (t.id === testId ? test : t))
          : [...state.tests, test],
        testDetailsById: {
          ...state.testDetailsById,
          [testId]: test,
        },
      }));
    } catch (error) {
      console.error('Error fetching practice test:', error);
    }
  },

  createTest: async (params) => {
    try {
      const test = await api.createPracticeTest(params);
      set((state) => ({
        tests: [test, ...state.tests],
      }));
      return test;
    } catch (error) {
      console.error('Error creating practice test:', error);
      throw error;
    }
  },

  generateTest: async (testId: string, signal?: AbortSignal) => {
    try {
      set((state) => ({
        generationProgress: {
          ...state.generationProgress,
          [testId]: { stage: 'collecting' },
        },
      }));

      const response = await api.generatePracticeTest(testId, signal);
      await consumeSSE<{
        type: GenerationProgress['stage'];
        count?: number;
        material?: { id: string; title: string };
        questionCount?: number;
        error?: string;
      }>(response, (event) => {
        set((state) => ({
          generationProgress: {
            ...state.generationProgress,
            [testId]: {
              stage: event.type,
              materialsCount: event.count ?? state.generationProgress[testId]?.materialsCount,
              currentMaterial: event.material ?? state.generationProgress[testId]?.currentMaterial,
              questionsGenerated: event.questionCount ?? state.generationProgress[testId]?.questionsGenerated,
              error: event.error,
            },
          },
        }));
      });

      // Fetch updated test info
      await get().fetchTest(testId, true);

      set((state) => {
        const rest = { ...state.generationProgress };
        delete rest[testId];
        return { generationProgress: rest };
      });
    } catch (error) {
      console.error('Error generating practice test:', error);
      set((state) => ({
        generationProgress: {
          ...state.generationProgress,
          [testId]: {
            stage: 'done',
            error: String(error),
          },
        },
      }));
    }
  },

  submitAttempt: async (testId: string, answers: Record<string, string | number | boolean>) => {
    try {
      const result = await api.submitTestAttempt(testId, answers);
      set((state) => ({
        testAttempts: {
          ...state.testAttempts,
          [testId]: [result.attempt, ...(state.testAttempts[testId] || [])],
        },
      }));
      return result;
    } catch (error) {
      console.error('Error submitting test attempt:', error);
      throw error;
    }
  },

  fetchAttempts: async (testId: string) => {
    try {
      const attempts = await api.getTestAttempts(testId);
      set((state) => ({
        testAttempts: {
          ...state.testAttempts,
          [testId]: attempts,
        },
      }));
    } catch (error) {
      console.error('Error fetching test attempts:', error);
    }
  },

  deleteTest: async (testId: string) => {
    try {
      await api.deletePracticeTest(testId);
      set((state) => {
        const testDetailsById = { ...state.testDetailsById };
        delete testDetailsById[testId];
        return {
          tests: state.tests.filter((t) => t.id !== testId),
          testDetailsById,
        };
      });
    } catch (error) {
      console.error('Error deleting practice test:', error);
      throw error;
    }
  },

  setGenerationProgress: (testId: string, progress: GenerationProgress) => {
    set((state) => ({
      generationProgress: {
        ...state.generationProgress,
        [testId]: progress,
      },
    }));
  },

  clearGenerationProgress: (testId: string) => {
    set((state) => {
      const rest = { ...state.generationProgress };
      delete rest[testId];
      return { generationProgress: rest };
    });
  },
}));
