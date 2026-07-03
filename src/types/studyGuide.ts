/** Lifecycle status of the study guide generation pipeline. */
export type StudyGuideStatus = 'pending' | 'generating' | 'done' | 'error';

/** A single concept in the concept roadmap. */
export interface ConceptRoadmapItem {
  concept: string;
  description: string;
  dependsOn: string[];
}

/** Per-material breakdown within the study guide. */
export interface MaterialDigest {
  documentId: string;
  chapterId?: string;
  title: string;
  summary: string;
  keyPoints: string[];
  formulas: string[];
  definitions: string[];
}

/** An item in the suggested study order. */
export interface SuggestedOrderItem {
  title: string;
  documentId?: string;
  chapterId?: string;
  reason: string;
}

/** Full generated content of a study guide (stored in `content` JSONB). */
export interface StudyGuideContent {
  overview: string;
  prerequisites: string[];
  conceptRoadmap: ConceptRoadmapItem[];
  perMaterial: MaterialDigest[];
  keyFormulas: string[];
  keyDefinitions: string[];
  suggestedOrder: SuggestedOrderItem[];
  generatedAt: string;
}

/** A study guide row (mirrors the backend response). */
export interface StudyGuide {
  id: string;
  courseId: string | null;
  documentId: string | null;
  title: string;
  content: StudyGuideContent | null;
  status: StudyGuideStatus;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}
