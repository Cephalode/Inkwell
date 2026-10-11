import { create } from 'zustand';
import type {
  ActivityKind,
  DiscussionTurnResponse,
  FlowSlot,
  LearningActivity,
  LearningMode,
  LearningOverview,
  Roadmap,
  SkillWithCourses,
  StepDetail,
  SubmitResponse,
} from '../types/learning';
import {
  reduceGenerationEvent,
  initialProgress,
  type GenerationEvent,
  type GenerationProgress,
} from '../types/generation';
import * as api from '../services/api/learning';
import { consumeSSE } from '../utils/sse';

interface LearningState {
  /** `null` = fetched and the course has no roadmap yet; `undefined` = not fetched. */
  roadmapsByCourseId: Record<string, Roadmap | null | undefined>;
  roadmapLoading: Record<string, boolean>;
  /** Roadmap generation progress, keyed by course id. */
  generation: Record<string, GenerationProgress>;
  stepsById: Record<string, StepDetail>;
  stepLoading: Record<string, boolean>;
  overview: LearningOverview | null;
  skills: SkillWithCourses[] | null;

  loadRoadmap: (courseId: string, force?: boolean) => Promise<Roadmap | null>;
  generateRoadmap: (courseId: string, signal?: AbortSignal, guidance?: string, documentIds?: string[], title?: string) => Promise<void>;
  loadStep: (stepId: string, force?: boolean) => Promise<StepDetail>;
  startActivity: (stepId: string, kind: ActivityKind, signal?: AbortSignal, slot?: FlowSlot) => Promise<LearningActivity>;
  /** The account's teaching style (legacy strategies vs guided flow). */
  learningMode: LearningMode | null;
  loadLearningMode: () => Promise<void>;
  setLearningMode: (mode: LearningMode) => Promise<void>;
  submitActivity: (activityId: string, payload: api.SubmitPayload) => Promise<SubmitResponse>;
  sendDiscussionMessage: (activityId: string, content: string) => Promise<DiscussionTurnResponse>;
  abandonActivity: (activityId: string) => Promise<void>;
  loadOverview: () => Promise<LearningOverview>;
  loadSkills: (force?: boolean) => Promise<SkillWithCourses[]>;
  setSkillMastery: (skillId: string, mastery: 'learned' | 'not_started') => Promise<void>;
  /** Make another saved roadmap version the course's active path. */
  switchRoadmap: (courseId: string, roadmapId: string) => Promise<void>;
  /** Rename a roadmap and/or move it to another course. */
  renameRoadmap: (courseId: string, roadmapId: string, updates: { title?: string; courseId?: string }) => Promise<void>;
  /** Delete a saved path; the server auto-promotes a sibling when the active one goes away. */
  deleteRoadmap: (courseId: string, roadmapId: string) => Promise<void>;
}

/** Merge (or insert) an activity into a cached step's activity list. */
function mergeActivity(step: StepDetail, activity: LearningActivity): StepDetail {
  const exists = step.activities.some((a) => a.id === activity.id);
  return {
    ...step,
    activities: exists
      ? step.activities.map((a) => (a.id === activity.id ? activity : a))
      : [activity, ...step.activities],
  };
}

export const useLearningStore = create<LearningState>()((set, get) => ({
  roadmapsByCourseId: {},
  roadmapLoading: {},
  generation: {},
  stepsById: {},
  stepLoading: {},
  overview: null,
  skills: null,
  learningMode: null,

  loadLearningMode: async () => {
    try {
      set({ learningMode: await api.getLearningMode() });
    } catch {
      set({ learningMode: 'legacy' }); // fail safe — the strategies UI always works
    }
  },

  setLearningMode: async (mode) => {
    set({ learningMode: mode }); // optimistic — the toggle must feel instant
    try {
      set({ learningMode: await api.setLearningMode(mode) });
    } catch {
      set({ learningMode: mode === 'flow' ? 'legacy' : 'flow' }); // roll back
      throw new Error('Could not save your learning style — check your connection');
    }
  },

  loadRoadmap: async (courseId, force = false) => {
    const cached = get().roadmapsByCourseId[courseId];
    if (!force && cached !== undefined) return cached;
    set((s) => ({ roadmapLoading: { ...s.roadmapLoading, [courseId]: true } }));
    try {
      const roadmap = await api.getCourseRoadmap(courseId);
      set((s) => ({ roadmapsByCourseId: { ...s.roadmapsByCourseId, [courseId]: roadmap } }));
      return roadmap;
    } finally {
      set((s) => ({ roadmapLoading: { ...s.roadmapLoading, [courseId]: false } }));
    }
  },

  generateRoadmap: async (courseId, signal, guidance, documentIds, title) => {
    set((s) => ({ generation: { ...s.generation, [courseId]: { ...initialProgress, stage: 'collecting' } } }));
    try {
      const created = await api.createCourseRoadmap(courseId, title);
      // Creating a version must not blank the switcher: keep any known
      // versions list, replacing only the view under generation.
      set((s) => ({
        roadmapsByCourseId: {
          ...s.roadmapsByCourseId,
          [courseId]: { ...created, versions: created.versions ?? s.roadmapsByCourseId[courseId]?.versions },
        },
      }));
      const response = await api.generateRoadmap(created.id, signal, guidance, documentIds);
      await consumeSSE<GenerationEvent & { roadmap?: Roadmap }>(
        response,
        (event) => {
          if (event.type === 'roadmap' && event.roadmap) {
            const roadmap = event.roadmap;
            set((s) => ({
              roadmapsByCourseId: {
                ...s.roadmapsByCourseId,
                [courseId]: { ...roadmap, versions: roadmap.versions ?? s.roadmapsByCourseId[courseId]?.versions },
              },
            }));
            return;
          }
          set((s) => ({
            generation: {
              ...s.generation,
              [courseId]: reduceGenerationEvent(s.generation[courseId] ?? initialProgress, event),
            },
          }));
        },
        signal,
      );
      const final = get().generation[courseId];
      if (final?.stage === 'error') throw new Error(final.error || 'Roadmap generation failed');
      await get().loadRoadmap(courseId, true);
      set((s) => {
        const rest = { ...s.generation };
        delete rest[courseId];
        return { generation: rest };
      });
      void get().loadOverview().catch(() => {});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set((s) => ({
        generation: {
          ...s.generation,
          [courseId]: { stage: 'error', itemsGenerated: s.generation[courseId]?.itemsGenerated ?? 0, error: message },
        },
      }));
      await get().loadRoadmap(courseId, true).catch(() => null);
      throw err;
    }
  },

  switchRoadmap: async (courseId, roadmapId) => {
    const roadmap = await api.activateRoadmap(roadmapId);
    set((s) => ({ roadmapsByCourseId: { ...s.roadmapsByCourseId, [courseId]: roadmap } }));
    void get().loadOverview().catch(() => {});
  },

  renameRoadmap: async (courseId, roadmapId, updates) => {
    const roadmap = await api.updateRoadmap(roadmapId, updates);
    set((s) => {
      const next = { ...s.roadmapsByCourseId };
      if (updates.courseId && updates.courseId !== courseId) delete next[courseId]; // moved away
      next[updates.courseId ?? courseId] = roadmap;
      return { roadmapsByCourseId: next };
    });
    void get().loadOverview().catch(() => {});
  },

  deleteRoadmap: async (courseId, roadmapId) => {
    await api.deleteRoadmap(roadmapId);
    // Re-fetch regardless: if we deleted the active path, the server promoted
    // a sibling — the refetch shows it; if it was the course's only path, this
    // correctly resolves to `null` (no roadmap yet).
    await get().loadRoadmap(courseId, true);
    void get().loadOverview().catch(() => {});
  },

  loadStep: async (stepId, force = false) => {
    const cached = get().stepsById[stepId];
    if (!force && cached) return cached;
    set((s) => ({ stepLoading: { ...s.stepLoading, [stepId]: true } }));
    try {
      const step = await api.getStep(stepId);
      set((s) => ({ stepsById: { ...s.stepsById, [stepId]: step } }));
      return step;
    } finally {
      set((s) => ({ stepLoading: { ...s.stepLoading, [stepId]: false } }));
    }
  },

  startActivity: async (stepId, kind, signal, slot) => {
    const activity = await api.startActivity(stepId, kind, signal, slot);
    set((s) => {
      const step = s.stepsById[stepId];
      return step ? { stepsById: { ...s.stepsById, [stepId]: mergeActivity(step, activity) } } : {};
    });
    return activity;
  },

  submitActivity: async (activityId, payload) => {
    const result = await api.submitActivity(activityId, payload);
    applyOutcome(set, get, result);
    return result;
  },

  sendDiscussionMessage: async (activityId, content) => {
    const turn = await api.sendDiscussionMessage(activityId, content);
    if (turn.done && turn.skill && turn.profile) {
      applyOutcome(set, get, turn as SubmitResponse);
    } else {
      set((s) => {
        const step = s.stepsById[turn.activity.stepId];
        return step ? { stepsById: { ...s.stepsById, [step.id]: mergeActivity(step, turn.activity) } } : {};
      });
    }
    return turn;
  },

  abandonActivity: async (activityId) => {
    await api.abandonActivity(activityId);
    set((s) => {
      const stepsById = { ...s.stepsById };
      for (const id of Object.keys(stepsById)) {
        const step = stepsById[id];
        if (step.activities.some((a) => a.id === activityId)) {
          stepsById[id] = { ...step, activities: step.activities.filter((a) => a.id !== activityId) };
        }
      }
      return { stepsById };
    });
  },

  loadOverview: async () => {
    const overview = await api.getLearningOverview();
    set({ overview });
    return overview;
  },

  loadSkills: async (force = false) => {
    const cached = get().skills;
    if (!force && cached) return cached;
    const skills = await api.listSkills();
    set({ skills });
    return skills;
  },

  setSkillMastery: async (skillId, mastery) => {
    const skill = await api.setSkillMastery(skillId, mastery);
    // Mastery is shared: refresh every cached surface that shows it.
    set((s) => ({
      skills: s.skills ? s.skills.map((k) => (k.id === skill.id ? { ...k, ...skill } : k)) : s.skills,
      stepsById: Object.fromEntries(
        Object.entries(s.stepsById).map(([id, step]) => [
          id,
          step.skillId === skill.id ? { ...step, skill, state: skill.mastery === 'learned' ? 'learned' : step.state } : step,
        ]),
      ),
    }));
    const courses = Object.keys(get().roadmapsByCourseId);
    await Promise.all(courses.map((c) => get().loadRoadmap(c, true).catch(() => null)));
    void get().loadOverview().catch(() => {});
  },
}));

/**
 * Fold a completed activity into every cached view: the step (activity +
 * skill), the course roadmap (states / next step), skills, and the overview.
 */
function applyOutcome(
  set: (fn: (s: LearningState) => Partial<LearningState>) => void,
  get: () => LearningState,
  result: SubmitResponse,
) {
  const { activity, skill } = result;
  set((s) => {
    const step = s.stepsById[activity.stepId];
    const stepsById = { ...s.stepsById };
    if (step) {
      stepsById[step.id] = {
        ...mergeActivity(step, activity),
        skill,
        state: skill.mastery === 'learned' ? 'learned' : step.state,
      };
    }
    // Any other cached step teaching the same skill shares the new mastery.
    for (const id of Object.keys(stepsById)) {
      if (id !== activity.stepId && stepsById[id].skillId === skill.id) {
        stepsById[id] = { ...stepsById[id], skill, state: skill.mastery === 'learned' ? 'learned' : stepsById[id].state };
      }
    }
    return {
      stepsById,
      overview: s.overview ? { ...s.overview, profile: result.profile } : s.overview,
      skills: s.skills ? s.skills.map((k) => (k.id === skill.id ? { ...k, ...skill } : k)) : s.skills,
    };
  });
  const step = get().stepsById[activity.stepId];
  const courseIds = new Set<string>(Object.keys(get().roadmapsByCourseId));
  if (step) courseIds.add(step.courseId);
  for (const c of courseIds) void get().loadRoadmap(c, true).catch(() => null);
  void get().loadStep(activity.stepId, true).catch(() => null);
  void get().loadOverview().catch(() => {});
}
