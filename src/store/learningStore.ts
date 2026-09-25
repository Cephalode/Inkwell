import { create } from 'zustand';
import type {
  ActivityKind,
  DiscussionTurnResponse,
  LearningActivity,
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
  generateRoadmap: (courseId: string, signal?: AbortSignal) => Promise<void>;
  loadStep: (stepId: string, force?: boolean) => Promise<StepDetail>;
  startActivity: (stepId: string, kind: ActivityKind, signal?: AbortSignal) => Promise<LearningActivity>;
  submitActivity: (activityId: string, payload: api.SubmitPayload) => Promise<SubmitResponse>;
  sendDiscussionMessage: (activityId: string, content: string) => Promise<DiscussionTurnResponse>;
  abandonActivity: (activityId: string) => Promise<void>;
  loadOverview: () => Promise<LearningOverview>;
  loadSkills: (force?: boolean) => Promise<SkillWithCourses[]>;
  setSkillMastery: (skillId: string, mastery: 'learned' | 'not_started') => Promise<void>;
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

  generateRoadmap: async (courseId, signal) => {
    set((s) => ({ generation: { ...s.generation, [courseId]: { ...initialProgress, stage: 'collecting' } } }));
    try {
      const created = await api.createCourseRoadmap(courseId);
      set((s) => ({ roadmapsByCourseId: { ...s.roadmapsByCourseId, [courseId]: created } }));
      const response = await api.generateRoadmap(created.id, signal);
      await consumeSSE<GenerationEvent & { roadmap?: Roadmap }>(
        response,
        (event) => {
          if (event.type === 'roadmap' && event.roadmap) {
            const roadmap = event.roadmap;
            set((s) => ({ roadmapsByCourseId: { ...s.roadmapsByCourseId, [courseId]: roadmap } }));
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

  startActivity: async (stepId, kind, signal) => {
    const activity = await api.startActivity(stepId, kind, signal);
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
