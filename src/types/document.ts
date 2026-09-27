export type DocumentType = 'pdf' | 'docx' | 'pptx' | 'txt' | 'md' | 'image' | 'audio' | 'video' | 'epub' | 'xlsx' | 'csv' | 'youtube' | 'link';

export interface Chapter {
  title: string;
  page: number;
}

export interface PageContent {
  pageNumber: number;
  text: string;
}

export interface ParsedDocument {
  text: string;
  pages?: PageContent[];
  chapters?: Chapter[];
  metadata?: Record<string, string>;
  thumbnail?: string;
}

export type ClassifyStatus = 'pending' | 'classifying' | 'done' | 'skipped';

export interface VideoSummary {
  summary: string;
  keyPoints: string[];
  formulas: string[];
  definitions: string[];
  topics: string[];
}

export interface DocumentFile {
  id: string;
  name: string;
  type: DocumentType;
  mimeType: string;
  size: number;
  rawBlob?: Blob;
  parsedText: string;
  parsedPages?: PageContent[];
  chapterMarkers?: Chapter[];
  thumbnail?: string;
  tags: string[];
  classifyStatus?: ClassifyStatus;
  videoSummary?: VideoSummary | null;
  /** Auto-generated markdown summary (TL;DR + Key Points). */
  summary?: string | null;
  /** 'pending' | 'generating' | 'done' | 'failed' | 'skipped' */
  summaryStatus?: string;
  /** Why summary generation failed (failures are data — shown inline with Retry). */
  summaryError?: string | null;
  /** 'pending' | 'generating' | 'done' | 'failed' | 'skipped' — audio overview status */
  podcastStatus?: string;
  podcastSections?: {
    title: string;
    durationS: number;
    sections: { title: string; startS: number; durationS?: number; lines: { speaker: 'host' | 'guest'; text: string; startS: number }[] }[];
  } | null;
  /** Why podcast generation failed. */
  podcastError?: string | null;
  /** Entitlement failure flag — the UI shows an upsell state instead of an error. */
  needsUpgrade?: boolean;
  /** Folder this document lives in (E1). */
  folderId?: string | null;
  /** Last time the user opened this document — drives "Jump back in" (E1). */
  lastOpenedAt?: string | null;
  /** Server-side path or, for YouTube docs, the source URL. */
  filePath?: string | null;
  /** If this document is a chapter inside a textbook, this is the textbook ID. */
  textbookId?: string | null;
  /** Page range / chapter metadata, populated when a document is a converted textbook chapter. */
  startPage?: number | null;
  endPage?: number | null;
  chapterIndex?: number | null;
  chapterTitle?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Textbook {
  id: string;
  name: string;
  description: string;
  documents: DocumentFile[];
  createdAt: number;
  updatedAt: number;
}

export interface ChapterDocument {
  id: string;
  parentId: string;
  chapterTitle: string;
  chapterIndex: number;
  startPage: number;
  endPage: number;
  rawBlob?: Blob;
  parsedText: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export const SUPPORTED_MIME_TYPES: Record<string, DocumentType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/bmp': 'image',
  'audio/mpeg': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
  'audio/webm': 'audio',
  'audio/mp4': 'audio',
  'video/mp4': 'video',
  'video/webm': 'video',
  'application/epub+zip': 'epub',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
};

export const SUPPORTED_EXTENSIONS: Record<string, DocumentType> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.pptx': 'pptx',
  '.txt': 'txt',
  '.md': 'md',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.bmp': 'image',
  '.mp3': 'audio',
  '.wav': 'audio',
  '.ogg': 'audio',
  '.webm': 'audio',
  '.m4a': 'audio',
  '.mp4': 'video',
  '.epub': 'epub',
  '.xlsx': 'xlsx',
  '.csv': 'csv',
};
