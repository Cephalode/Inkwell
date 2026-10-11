import type { Course } from '../types/course';
import type { Roadmap, RoadmapStep, StepState } from '../types/learning';

/** In-progress first, then next-up, then locked, then learned — the merged path reads as one efficient route. */
const RANK: Record<StepState, number> = { current: 0, available: 1, locked: 2, learned: 3 };

/**
 * "All courses" view: one combined trail across every course with a done
 * roadmap. Steps dedupe by skill (a shared skill appears once; duplicates
 * upgrade the state — learned/current win) and sort into a single path.
 * Mirrors inkwell-ios PathScreen.mergedRoadmap.
 */
export function mergeRoadmaps(courses: Course[], roadmaps: Array<Roadmap | null | undefined>): Roadmap {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const done = roadmaps.filter((r): r is Roadmap => !!r && r.status === 'done' && byId.has(r.courseId));
  const bySkill = new Map<string, RoadmapStep>();
  const order: string[] = [];
  let updatedAt = '';

  for (const r of done) {
    if (r.updatedAt > updatedAt) updatedAt = r.updatedAt;
    for (const step of r.steps) {
      const existing = bySkill.get(step.skillId);
      if (!existing) {
        bySkill.set(step.skillId, step);
        order.push(step.skillId);
      } else if (existing.state !== 'learned' && step.state === 'learned') {
        bySkill.set(step.skillId, { ...existing, state: 'learned' });
      } else if (existing.state === 'locked' && (step.state === 'current' || step.state === 'available')) {
        bySkill.set(step.skillId, { ...existing, state: step.state });
      }
    }
  }

  const steps = order
    .map((k) => bySkill.get(k)!)
    .sort((a, b) => RANK[a.state] - RANK[b.state] || a.title.localeCompare(b.title));
  const learned = steps.filter((s) => s.state === 'learned').length;
  const current = steps.find((s) => s.state === 'current');

  return {
    id: 'merged-all',
    courseId: 'all',
    title: 'All courses',
    overview: 'Every skill from your courses, combined into one path — in-progress first, then what\u2019s next, then what you\u2019ve mastered.',
    status: steps.length ? 'done' : 'pending',
    error: null,
    createdAt: done[0]?.createdAt ?? new Date().toISOString(),
    updatedAt,
    steps,
    nextStepId: current?.id ?? steps.find((s) => s.state === 'available')?.id ?? null,
    counts: {
      total: steps.length,
      learned,
      learning: steps.filter((s) => s.skill.mastery === 'learning').length,
      locked: steps.filter((s) => s.state === 'locked').length,
    },
  };
}
