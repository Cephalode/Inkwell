import { create } from 'zustand';
import * as api from '../services/api/videos';
import type { DocumentUsage, SkillVideos, VideoDetail, VideoPlan, WatchedResponse } from '../types/videos';
import { useLearningStore } from './learningStore';

interface VideoState {
  videosBySkill: Record<string, SkillVideos | undefined>;
  searchingSkills: Record<string, boolean>;
  videosById: Record<string, VideoDetail | undefined>;
  plan: VideoPlan | null;
  planCourseId: string | null | undefined;
  planLoading: boolean;
  documentUsage: DocumentUsage | null;

  loadSkillVideos: (skillId: string, force?: boolean) => Promise<SkillVideos>;
  searchSkillVideos: (skillId: string, force?: boolean) => Promise<SkillVideos>;
  loadVideo: (videoId: string, force?: boolean) => Promise<VideoDetail>;
  markWatched: (videoId: string) => Promise<WatchedResponse>;
  loadPlan: (courseId?: string) => Promise<VideoPlan>;
  /** Queue searches, then poll the plan until nothing is searching. */
  runPlan: (opts?: { courseId?: string; limit?: number }) => Promise<void>;
  loadDocumentUsage: (force?: boolean) => Promise<DocumentUsage>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const useVideoStore = create<VideoState>()((set, get) => ({
  videosBySkill: {},
  searchingSkills: {},
  videosById: {},
  plan: null,
  planCourseId: undefined,
  planLoading: false,
  documentUsage: null,

  loadSkillVideos: async (skillId, force = false) => {
    const cached = get().videosBySkill[skillId];
    if (cached && !force) return cached;
    const result = await api.getSkillVideos(skillId);
    set((s) => ({ videosBySkill: { ...s.videosBySkill, [skillId]: result } }));
    return result;
  },

  searchSkillVideos: async (skillId, force = false) => {
    set((s) => ({ searchingSkills: { ...s.searchingSkills, [skillId]: true } }));
    try {
      const result = await api.searchSkillVideos(skillId, force);
      set((s) => ({ videosBySkill: { ...s.videosBySkill, [skillId]: result } }));
      return result;
    } finally {
      set((s) => ({ searchingSkills: { ...s.searchingSkills, [skillId]: false } }));
    }
  },

  loadVideo: async (videoId, force = false) => {
    const cached = get().videosById[videoId];
    if (cached && !force) return cached;
    const video = await api.getVideo(videoId);
    set((s) => ({ videosById: { ...s.videosById, [videoId]: video } }));
    return video;
  },

  markWatched: async (videoId) => {
    const result = await api.markVideoWatched(videoId);
    set((s) => {
      const prev = s.videosById[videoId];
      return {
        videosById: { ...s.videosById, [videoId]: prev ? { ...prev, ...result.video } : s.videosById[videoId] },
        // Mastery may have moved: drop per-skill caches so they re-rank on next read.
        videosBySkill: {},
        plan: s.plan ? { ...s.plan, videos: s.plan.videos.map((v) => (v.id === videoId ? result.video : v)) } : s.plan,
      };
    });
    // Shared mastery changed → refresh the learning surfaces that show it.
    const learning = useLearningStore.getState();
    for (const sk of result.skills) {
      for (const [id, step] of Object.entries(learning.stepsById)) {
        if (step.skillId === sk.skillId) void learning.loadStep(id, true).catch(() => null);
      }
    }
    void learning.loadOverview().catch(() => {});
    void learning.loadSkills(true).catch(() => {});
    return result;
  },

  loadPlan: async (courseId) => {
    set({ planLoading: true });
    try {
      const plan = await api.getVideoPlan(courseId);
      set({ plan, planCourseId: courseId ?? null });
      return plan;
    } finally {
      set({ planLoading: false });
    }
  },

  runPlan: async (opts = {}) => {
    if (opts.courseId) await api.searchCourseVideos(opts.courseId, opts.limit ?? 6);
    else await api.runVideoPlan(opts.limit ?? 5);
    // Poll while the background job works (searches are sequential, ~20-90 s each live).
    for (let i = 0; i < 120; i++) {
      const plan = await get().loadPlan(opts.courseId);
      if (plan.stats.searching === 0) break;
      await sleep(3000);
    }
    set({ videosBySkill: {} });
  },

  loadDocumentUsage: async (force = false) => {
    const cached = get().documentUsage;
    if (cached && !force) return cached;
    const usage = await api.getDocumentUsage();
    set({ documentUsage: usage });
    return usage;
  },
}));
