/**
 * Self-check for mergeRoadmaps (the "All courses" trail) — run:
 *   npx tsx server/scripts/check-merge-roadmaps.ts
 * Dedupe by skill, state upgrade, sort order, counts.
 */
import assert from 'node:assert/strict';
import { mergeRoadmaps } from '../../src/utils/mergeRoadmaps.js';
import type { Course } from '../../src/types/course.js';
import type { Roadmap, RoadmapStep, StepState } from '../../src/types/learning.js';

const course = (id: string): Course => ({ id, name: `C${id}`, documentIds: ['d1'], createdAt: 0, updatedAt: 0 });
const step = (skillId: string, state: StepState, title = skillId): RoadmapStep =>
  ({
    id: `s-${skillId}-${state}`, roadmapId: 'r', skillId, position: 0, title, description: '',
    objectives: [], keyPoints: [], dependsOn: [], sourceRefs: [], estimatedMinutes: 10,
    skill: { id: skillId, slug: skillId, label: title, description: '', mastery: state === 'learned' ? 'learned' : 'not_started', masteryScore: 0, learnedAt: null },
    state, activities: [], alsoIn: [],
  }) as RoadmapStep;
const rm = (courseId: string, steps: RoadmapStep[]): Roadmap =>
  ({ id: `r-${courseId}`, courseId, title: 't', overview: '', status: 'done', error: null, createdAt: '', updatedAt: '2026-01-01', steps, nextStepId: null, counts: { total: steps.length, learned: 0, learning: 0, locked: 0 } });

const courses = [course('a'), course('b')];

// 1. Shared skill appears once; learned wins over not-started.
{
  const m = mergeRoadmaps(courses, [
    rm('a', [step('sk1', 'learned'), step('sk2', 'current')]),
    rm('b', [step('sk1', 'available'), step('sk3', 'learned')]),
  ]);
  assert.equal(m.steps.length, 3, 'dedupe by skill');
  const sk1 = m.steps.find((s) => s.skillId === 'sk1')!;
  assert.equal(sk1.state, 'learned', 'learned upgrade wins');
  // Sort: current first, then learned.
  assert.equal(m.steps[0].skillId, 'sk2', 'in-progress first');
  assert.deepEqual(m.counts, { total: 3, learned: 2, learning: 0, locked: 0 });
  assert.equal(m.nextStepId, m.steps.find((s) => s.state === 'current')?.id ?? null, 'next = the current step');
}

// 2. Locked loosens when another course offers the skill un-locked.
{
  const m = mergeRoadmaps(courses, [
    rm('a', [step('sk1', 'locked')]),
    rm('b', [step('sk1', 'current')]),
  ]);
  assert.equal(m.steps[0].state, 'current', 'locked loosens to current');
}

// 3. Non-done roadmaps ignored; empty merge reports pending.
{
  const pending = { ...rm('a', [step('sk1', 'current')]), status: 'generating' as const };
  const m = mergeRoadmaps(courses, [pending, null, undefined]);
  assert.equal(m.status, 'pending');
  assert.equal(m.steps.length, 0);
}

// 4. Ties break alphabetically so the order is stable.
{
  const m = mergeRoadmaps(courses, [rm('a', [step('s-b', 'current'), step('s-a', 'current')])]);
  assert.deepEqual(m.steps.map((s) => s.skillId), ['s-a', 's-b']);
}

console.log('✓ mergeRoadmaps: dedupe, state upgrade, sort, counts, pending fallback, stable order');
