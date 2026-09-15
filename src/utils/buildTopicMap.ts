import type { Course } from '../types/course';
import type { StudyGuide } from '../types/studyGuide';
import type { Flashcard, FlashcardDeck } from '../types/flashcards';
import { masteryLevel, type SkillWithCourses } from '../types/learning';
import {
  FOUNDATION_COURSE,
  type TopicEdge,
  type TopicMap,
  type TopicMapCourse,
  type TopicNode,
} from '../types/topicMap';

/** The "known" green of the prototype (matches --color-success). */
export const FOUNDATION_HUE = '#2f9e57';

/** Muted course hues from the Study Desk prototype, cycled in course order. */
export const COURSE_HUES = ['#2380a2', '#b8547c', '#9c6a24', '#5d8a50', '#6f5fa8', '#a3543b'];

/** Hue for a course id on the map (foundations are green). */
export function courseHue(map: TopicMap, courseId: string): string {
  if (courseId === FOUNDATION_COURSE) return FOUNDATION_HUE;
  return map.courses.find((c) => c.id === courseId)?.hue ?? 'var(--color-neutral-500)';
}

/** Course display name on the map. */
export function courseName(map: TopicMap, courseId: string): string {
  if (courseId === FOUNDATION_COURSE) return 'Foundations';
  return map.courses.find((c) => c.id === courseId)?.name ?? 'Course';
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Correct-rate threshold at which a fully reviewed topic counts as learned. */
const LEARNED_RATE = 0.8;

/**
 * Builds the topic map from learning-suite roadmaps (skills + steps), study guides
 * (concept roadmaps + prerequisites), courses (hues, grouping) and flashcards
 * (fallback mastery, "Review N cards").
 *
 * - Every roadmap step becomes a topic in its course, keyed by the shared skill:
 *   the same skill in two courses is two nodes with one mastery, linked across
 *   courses. Consecutive steps of a course are linked so the map shows the path.
 * - Every study-guide roadmap concept becomes a topic in its guide's course (a
 *   document guide joins the course that holds the document; guides for unfiled
 *   documents are skipped). A concept that names a skill already on the map in
 *   the same course merges into that skill topic instead of duplicating it.
 * - Every guide prerequisite becomes a foundation topic in the shared green core.
 * - `dependsOn` names link a topic to the topic it builds on — first inside the course,
 *   then to a foundation, then across courses (a dashed link). Same-named concepts in
 *   two courses are linked too.
 * - Mastery: skill topics take the skill's server-tracked mastery. Guide-only topics
 *   fall back to flashcards in the course's decks that mention the topic: all reviewed
 *   and ≥80% correct → learned; some reviewed → in progress.
 */
export function buildTopicMap(
  courses: Course[],
  guides: StudyGuide[],
  decks: FlashcardDeck[],
  cardsByDeckId: Record<string, Flashcard[]>,
  skills: SkillWithCourses[] = [],
): TopicMap {
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const courseOfGuide = (g: StudyGuide): Course | undefined => {
    if (g.courseId) return courseById.get(g.courseId);
    if (g.documentId) return courses.find((c) => c.documentIds.includes(g.documentId!));
    return undefined;
  };

  const topics: TopicNode[] = [];
  const normOf = new Map<string, string>(); // topic id → normalized name
  const byCourseKey = new Map<string, TopicNode>(); // `${courseId}\0${norm}` → concept node
  const byNorm = new Map<string, TopicNode[]>(); // norm → concept nodes across courses
  const foundations = new Map<string, TopicNode>(); // norm → foundation node
  const foundationCourses = new Map<string, Set<string>>(); // norm → assuming course names
  const dependsOn = new Map<string, string[]>(); // concept id → normalized names it builds on
  const stepsByCourse = new Map<string, Array<{ id: string; position: number }>>(); // course → its roadmap path

  // ── Roadmap skills first: they own mastery, guides only decorate them ──
  for (const skill of skills) {
    const n = norm(skill.label ?? '');
    if (!n) continue;
    for (const entry of skill.courses) {
      if (!courseById.has(entry.courseId)) continue;
      const key = `${entry.courseId}\0${n}`;
      if (byCourseKey.has(key)) continue;
      const node: TopicNode = {
        id: `topic:${entry.courseId}:skill:${skill.id}`,
        label: skill.label.trim(),
        courseId: entry.courseId,
        mastery: masteryLevel(skill.mastery),
        masteryScore: skill.masteryScore,
        description: skill.description ?? '',
        source: 'Roadmap',
        cards: 0,
        skillId: skill.id,
        stepId: entry.stepId,
      };
      topics.push(node);
      normOf.set(node.id, n);
      byCourseKey.set(key, node);
      byNorm.set(n, [...(byNorm.get(n) ?? []), node]);
      dependsOn.set(node.id, []);
      stepsByCourse.set(entry.courseId, [...(stepsByCourse.get(entry.courseId) ?? []), { id: node.id, position: entry.position }]);
    }
  }

  for (const g of guides) {
    if (g.status !== 'done' || !g.content) continue;
    const course = courseOfGuide(g);
    if (!course) continue;

    for (const item of g.content.conceptRoadmap ?? []) {
      const n = norm(item.concept ?? '');
      if (!n) continue;
      const key = `${course.id}\0${n}`;
      let node = byCourseKey.get(key);
      if (node?.skillId) {
        // Same concept as a roadmap skill: give the skill topic the guide's deep links.
        node.guideId ??= g.id;
        node.documentId ??= g.documentId ?? undefined;
        if (!node.description) node.description = item.description ?? '';
      } else if (!node) {
        const material = (g.content.perMaterial ?? []).find((m) =>
          [m.summary, ...(m.keyPoints ?? []), ...(m.definitions ?? [])].join(' ').toLowerCase().includes(n),
        );
        node = {
          id: `topic:${course.id}:${topics.length}`,
          label: item.concept.trim(),
          courseId: course.id,
          mastery: 0,
          description: item.description ?? '',
          source: material?.title ?? g.title,
          cards: 0,
          guideId: g.id,
          documentId: g.documentId ?? undefined,
        };
        topics.push(node);
        normOf.set(node.id, n);
        byCourseKey.set(key, node);
        byNorm.set(n, [...(byNorm.get(n) ?? []), node]);
        dependsOn.set(node.id, []);
      }
      dependsOn.get(node.id)!.push(...(item.dependsOn ?? []).map(norm).filter(Boolean));
    }

    for (const p of g.content.prerequisites ?? []) {
      const n = norm(p);
      if (!n) continue;
      if (!foundations.has(n)) {
        foundations.set(n, {
          id: `foundation:${foundations.size}`,
          label: p.trim(),
          courseId: FOUNDATION_COURSE,
          mastery: 3,
          description: '',
          source: '',
          cards: 0,
        });
        foundationCourses.set(n, new Set());
      }
      foundationCourses.get(n)!.add(course.name);
    }
  }

  for (const [n, f] of foundations) {
    f.source = `Assumed by ${[...foundationCourses.get(n)!].join(' · ')}`;
    normOf.set(f.id, n);
    topics.push(f);
  }

  // ── Edges ──────────────────────────────────────────────────────
  const edges: TopicEdge[] = [];
  const edgeKeys = new Set<string>();
  const addEdge = (a: string, b: string) => {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ a, b });
  };

  const conceptById = new Map(topics.map((t) => [t.id, t]));
  for (const [id, deps] of dependsOn) {
    const courseId = conceptById.get(id)!.courseId;
    for (const d of deps) {
      const same = byCourseKey.get(`${courseId}\0${d}`);
      if (same) { addEdge(id, same.id); continue; }
      const found = foundations.get(d);
      if (found) { addEdge(id, found.id); continue; }
      for (const other of byNorm.get(d) ?? []) addEdge(id, other.id);
    }
  }
  for (const group of byNorm.values()) {
    for (let i = 1; i < group.length; i++) addEdge(group[0].id, group[i].id);
  }
  for (const [n, f] of foundations) {
    for (const t of byNorm.get(n) ?? []) addEdge(f.id, t.id);
  }
  // The roadmap path: consecutive steps of a course, in step order.
  for (const steps of stepsByCourse.values()) {
    steps.sort((a, b) => a.position - b.position);
    for (let i = 1; i < steps.length; i++) addEdge(steps[i - 1].id, steps[i].id);
  }

  // ── Flashcards: "Review N cards" for every topic; mastery only for guide-only topics ──
  const cardsByCourse = new Map<string, Flashcard[]>();
  const allCards: Flashcard[] = [];
  for (const deck of decks) {
    if (deck.status !== 'done') continue;
    const cards = cardsByDeckId[deck.id];
    if (!cards?.length) continue;
    allCards.push(...cards);
    if (deck.course_id) cardsByCourse.set(deck.course_id, [...(cardsByCourse.get(deck.course_id) ?? []), ...cards]);
  }
  for (const t of topics) {
    const n = normOf.get(t.id) ?? '';
    if (n.length < 3) continue;
    const pool = t.courseId === FOUNDATION_COURSE ? allCards : cardsByCourse.get(t.courseId) ?? [];
    const matched = pool.filter((c) => `${c.front} ${c.back}`.toLowerCase().includes(n));
    if (!matched.length) continue;
    t.cards = matched.length;
    const perDeck = new Map<string, number>();
    for (const c of matched) perDeck.set(c.deck_id, (perDeck.get(c.deck_id) ?? 0) + 1);
    t.deckId = [...perDeck.entries()].sort((a, b) => b[1] - a[1])[0][0];
    if (t.courseId === FOUNDATION_COURSE || t.skillId) continue; // skill mastery is server-tracked
    const reviewed = matched.filter((c) => (c.review_stats?.timesReviewed ?? 0) > 0);
    if (!reviewed.length) continue;
    const attempts = reviewed.reduce((s, c) => s + (c.review_stats?.timesReviewed ?? 0), 0);
    const correct = reviewed.reduce((s, c) => s + (c.review_stats?.timesCorrect ?? 0), 0);
    t.mastery = reviewed.length === matched.length && attempts > 0 && correct / attempts >= LEARNED_RATE ? 2 : 1;
  }

  // ── Courses on the map (only those with topics), hue by course order ──
  const withTopics = new Set(topics.map((t) => t.courseId));
  const mapCourses: TopicMapCourse[] = courses
    .map((c, i) => ({ id: c.id, name: c.name, hue: COURSE_HUES[i % COURSE_HUES.length] }))
    .filter((c) => withTopics.has(c.id));

  return { courses: mapCourses, topics, edges };
}
