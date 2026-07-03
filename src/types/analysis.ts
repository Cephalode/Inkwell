/** A single analyzed subsection within a chapter. */
export interface SubsectionAnalysis {
  title: string;
  startPage: number;
  endPage: number;
  summary: string;
  keyPoints: string[];
  formulas: string[];
  definitions: string[];
}

/** A subsection detected during the analysis pipeline (before deep analysis). */
export interface DetectedSubsection {
  title: string;
  startPage: number;
  endPage: number;
}

/** Full cached analysis result for a chapter (returned by GET /analysis). */
export interface ChapterAnalysis {
  subsections: SubsectionAnalysis[];
  chapterNotes: string;
  analyzedAt: string;
}

/** Lifecycle status of the analysis pipeline. */
export type AnalysisStatus =
  | 'idle'
  | 'loading-cache'
  | 'extracting'
  | 'detecting'
  | 'analyzing'
  | 'synthesizing'
  | 'done'
  | 'error';
