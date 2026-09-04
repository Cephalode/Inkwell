/**
 * Topic map — the Study Desk prototype's "Topic map" screen, built from real data:
 * study-guide concept roadmaps (topics + what they build on), guide prerequisites
 * (the foundations a course assumes) and flashcard review stats (mastery).
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
