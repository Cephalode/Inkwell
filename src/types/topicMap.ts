/**
 * Topic map — the Study Desk prototype's "Topic map" screen, built from real data:
 * learning-suite roadmaps (skills + steps, with server-tracked mastery), study-guide
 * concept roadmaps (topics + what they build on), guide prerequisites (the
 * foundations a course assumes) and flashcard review stats (fallback mastery).
 */

/** 0 not started · 1 in progress · 2 learned · 3 foundation (assumed known by a course). */
export type TopicMastery = 0 | 1 | 2 | 3;

/** Pseudo-course id for foundation topics — the prerequisites your courses assume you know. */
export const FOUNDATION_COURSE = 'me';

export interface TopicNode {
  id: string;
  label: string;
  /** Course id, or FOUNDATION_COURSE for a prerequisite shared by the core. */
  courseId: string;
  mastery: TopicMastery;
  description: string;
  /** Where the topic came from — a study-guide material title, the guide itself, or the assuming courses. */
  source: string;
  /** Flashcards (in this course's decks) whose text mentions the topic. */
  cards: number;
  /** Deck holding most of those cards. */
  deckId?: string;
  /** Study guide the topic came from (for deep links). */
  guideId?: string;
  /** Document whose guide produced the topic, if the guide was a document guide. */
  documentId?: string;
  /** Learning-suite skill behind the topic (shared across courses); mastery is then skill-driven. */
  skillId?: string;
  /** Roadmap step teaching the skill in this course (deep link to /learn/steps/:stepId). */
  stepId?: string;
  /** 0..1 rolling confidence from the skill's evidence trail (skill topics only). */
  masteryScore?: number;
}

/** Undirected link between two topics. */
export interface TopicEdge {
  a: string;
  b: string;
}

export interface TopicMapCourse {
  id: string;
  name: string;
  hue: string;
}

export interface TopicMap {
  /** Courses that contribute at least one topic, in course order. */
  courses: TopicMapCourse[];
  topics: TopicNode[];
  edges: TopicEdge[];
}
