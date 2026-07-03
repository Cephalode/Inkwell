import type { DocumentFile, ChapterDocument, Textbook } from '../../types/document';
import type { Course } from '../../types/course';
import type { ChatSession, ChatMessage } from '../../types/chat';
import type { ChapterAnalysis } from '../../types/analysis';
import type { StudyGuide } from '../../types/studyGuide';

/**
 * Build an absolute API base URL so that `fetch()` always receives a
 * fully-qualified URL (avoids "Failed to parse URL from /api/…" errors
 * that can arise in some browser / worker contexts).
 * Falls back to the relative '/api' path when `window` is unavailable
 * (e.g. during SSR or unit-test runs in Node).
 */
const API_BASE: string =
  typeof window !== 'undefined'
    ? `${window.location.origin}/api`
    : '/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert an ISO date string from the backend to epoch milliseconds. */
function toEpoch(iso: string): number {
  return new Date(iso).getTime();
}

/** Map a backend document response to the frontend DocumentFile type. */
function mapDocument(r: any): DocumentFile {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    mimeType: r.mimeType,
    size: r.size,
    rawBlob: undefined,
    parsedText: r.parsedText ?? '',
    thumbnail: r.thumbnail ?? undefined,
    chapterMarkers: r.chapterMarkers ?? undefined,
    tags: r.tags ?? [],
    classifyStatus: r.classifyStatus ?? undefined,
    videoSummary: r.videoSummary ?? undefined,
    filePath: r.filePath ?? undefined,
    createdAt: toEpoch(r.createdAt),
    updatedAt: toEpoch(r.updatedAt),
  };
}

/** Map a backend chapter response to the frontend ChapterDocument type. */
function mapChapter(r: any): ChapterDocument {
  return {
    id: r.id,
    parentId: r.parentId,
    chapterTitle: r.chapterTitle,
    chapterIndex: r.chapterIndex,
    startPage: r.startPage,
    endPage: r.endPage,
    rawBlob: undefined,
    parsedText: r.parsedText ?? '',
    tags: r.tags ?? [],
    createdAt: toEpoch(r.createdAt),
    updatedAt: toEpoch(r.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// Document API
// ---------------------------------------------------------------------------

export async function uploadDocument(file: File): Promise<DocumentFile> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(`${API_BASE}/documents`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const json = await res.json();
  return mapDocument(json);
}

export async function listDocuments(): Promise<DocumentFile[]> {
  const res = await fetch(`${API_BASE}/documents`);
  if (!res.ok) throw new Error(`Failed to list documents: ${res.status}`);
  const json: any[] = await res.json();
  return json.map(mapDocument);
}

export async function getDocument(id: string): Promise<DocumentFile> {
  const res = await fetch(`${API_BASE}/documents/${id}`);
  if (!res.ok) throw new Error(`Failed to get document: ${res.status}`);
  const json = await res.json();
  return mapDocument(json);
}

export async function downloadDocumentFile(id: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/documents/${id}/download`);
  if (!res.ok) throw new Error(`Failed to download document file: ${res.status}`);
  return await res.blob();
}

export async function updateDocumentTags(id: string, tags: string[]): Promise<void> {
  const res = await fetch(`${API_BASE}/documents/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
  if (!res.ok) throw new Error(`Failed to update tags: ${res.status}`);
}

export async function updateDocument(id: string, updates: { parsedText?: string; thumbnail?: string; chapterMarkers?: Array<{ title: string; page: number }>; tags?: string[]; name?: string }): Promise<void> {
  const res = await fetch(`${API_BASE}/documents/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Failed to update document: ${res.status}`);
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/documents/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(`Failed to delete document: ${res.status}`);
}

export async function classifyDocument(id: string): Promise<{ label: string; subject: string; confidence: number; status: string }> {
  const res = await fetch(`${API_BASE}/documents/${id}/classify`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to classify document: ${res.status}`);
  return await res.json();
}

/**
 * Create a document from a video URL (YouTube etc.). The backend fetches the
 * transcript, creates the document, and triggers background classification.
 */
export async function createDocumentFromUrl(url: string): Promise<DocumentFile> {
  const res = await fetch(`${API_BASE}/documents/from-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch transcript');
  }
  const json = await res.json();
  return mapDocument(json);
}

/**
 * Fetch an AI-generated video summary via an SSE stream. Returns the raw
 * `Response` whose `body` is the stream; the caller parses the events.
 *
 * SSE events:
 *   {"type":"analyzing","message":"Analyzing transcript…"}
 *   {"type":"result","summary":"...","keyPoints":[...],"formulas":[...],...}
 *   {"type":"done"}
 *   {"type":"error","message":"..."}
 */
export async function fetchVideoSummary(docId: string): Promise<Response> {
  const res = await fetch(`${API_BASE}/documents/${docId}/video-summary`, {
    headers: { Accept: 'text/event-stream' },
  });
  if (!res.ok) throw new Error(`Failed to fetch video summary: ${res.status}`);
  return res;
}

// ---------------------------------------------------------------------------
// Textbook API
// ---------------------------------------------------------------------------

function mapTextbook(r: any): Textbook {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    documents: (r.documents ?? []).map(mapDocument),
    createdAt: toEpoch(r.createdAt),
    updatedAt: toEpoch(r.updatedAt),
  };
}

export async function listTextbooks(): Promise<Textbook[]> {
  const res = await fetch(`${API_BASE}/textbooks`);
  if (!res.ok) throw new Error('Failed to list textbooks');
  const data = await res.json();
  return data.map(mapTextbook);
}

export async function convertToTextbook(documentId: string): Promise<Textbook> {
  const res = await fetch(`${API_BASE}/documents/${documentId}/convert-to-textbook`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Failed to convert: ${res.status}`);
  }
  return mapTextbook(await res.json());
}

export async function deleteTextbook(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/textbooks/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(`Failed to delete textbook: ${res.status}`);
}

// ---------------------------------------------------------------------------
// Chapter API
// ---------------------------------------------------------------------------

export async function listChapters(parentId: string): Promise<ChapterDocument[]> {
  const res = await fetch(`${API_BASE}/documents/${parentId}/chapters`);
  if (!res.ok) throw new Error(`Failed to list chapters: ${res.status}`);
  const json: any[] = await res.json();
  return json.map(mapChapter);
}

export async function uploadChapters(
  parentId: string,
  chapters: {
    blob: Blob;
    metadata: {
      chapterTitle: string;
      chapterIndex: number;
      startPage: number;
      endPage: number;
      parsedText: string;
      tags: string[];
    };
  }[],
): Promise<ChapterDocument[]> {
  const form = new FormData();
  chapters.forEach(({ blob }) => {
    form.append('files', blob);
  });
  form.append('metadata', JSON.stringify(chapters.map((c) => c.metadata)));

  const res = await fetch(`${API_BASE}/documents/${parentId}/chapters`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(`Failed to upload chapters: ${res.status}`);
  const json: any[] = await res.json();
  return json.map(mapChapter);
}

export async function uploadSingleChapter(
  parentId: string,
  blob: Blob,
  metadata: {
    chapterTitle: string;
    chapterIndex: number;
    startPage: number;
    endPage: number;
    tags: string[];
  },
): Promise<ChapterDocument> {
  const form = new FormData();
  form.append('files', blob);
  form.append('metadata', JSON.stringify([{ ...metadata, parsedText: '' }]));

  const res = await fetch(`${API_BASE}/documents/${parentId}/chapters`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(`Failed to upload chapter: ${res.status}`);
  const json: any[] = await res.json();
  return json.map(mapChapter)[0];
}

export async function deleteChapters(parentId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/documents/${parentId}/chapters`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(`Failed to delete chapters: ${res.status}`);
}

export async function getChapter(id: string): Promise<ChapterDocument> {
  const res = await fetch(`${API_BASE}/chapters/${id}`);
  if (!res.ok) throw new Error(`Failed to get chapter: ${res.status}`);
  const json = await res.json();
  return mapChapter(json);
}

// ---------------------------------------------------------------------------
// Chapter Analysis API
// ---------------------------------------------------------------------------

/**
 * Kick off an AI analysis for a chapter. Returns the raw `Response` whose
 * `body` is an SSE stream of progress/result events. The caller is
 * responsible for reading and parsing the stream.
 *
 * @param chapterId The saved chapter ID to analyze.
 * @param signal    Optional AbortSignal to cancel the request / stream.
 */
export async function analyzeChapter(chapterId: string, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(`${API_BASE}/chapters/${chapterId}/analyze`, {
    method: 'POST',
    headers: { Accept: 'text/event-stream' },
    signal,
  });
  if (!res.ok) throw new Error(`Failed to start analysis: ${res.status}`);
  return res;
}

/**
 * Fetch a previously-computed (cached) chapter analysis. Returns `null` when
 * no analysis has been cached yet (HTTP 404).
 */
export async function getChapterAnalysis(chapterId: string): Promise<ChapterAnalysis | null> {
  const res = await fetch(`${API_BASE}/chapters/${chapterId}/analysis`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to get analysis: ${res.status}`);
  return (await res.json()) as ChapterAnalysis;
}

// ---------------------------------------------------------------------------
// Courses API
// ---------------------------------------------------------------------------

function mapCourse(r: any): Course {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    color: r.color ?? '',
    documentIds: r.documentIds ?? [],
    createdAt: toEpoch(r.createdAt),
    updatedAt: toEpoch(r.updatedAt),
  };
}

export async function listCourses(): Promise<Course[]> {
  const res = await fetch(`${API_BASE}/courses`);
  if (!res.ok) throw new Error('Failed to list courses');
  const data = await res.json();
  return data.map(mapCourse);
}

export async function getCourse(id: string): Promise<Course> {
  const res = await fetch(`${API_BASE}/courses/${id}`);
  if (!res.ok) throw new Error('Failed to get course');
  const data = await res.json();
  return mapCourse(data);
}

export async function createCourse(course: { name: string; description?: string; color?: string }): Promise<Course> {
  const res = await fetch(`${API_BASE}/courses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: `course_${Date.now()}`,
      name: course.name,
      description: course.description ?? '',
      color: course.color ?? '',
      document_ids: [],
    }),
  });
  if (!res.ok) throw new Error('Failed to create course');
  const data = await res.json();
  return mapCourse(data);
}

export async function updateCourse(id: string, updates: Partial<Pick<Course, 'name' | 'description' | 'color' | 'documentIds'>>): Promise<Course> {
  const body: Record<string, unknown> = {};
  if (updates.name !== undefined) body.name = updates.name;
  if (updates.description !== undefined) body.description = updates.description;
  if (updates.color !== undefined) body.color = updates.color;
  if (updates.documentIds !== undefined) body.documentIds = updates.documentIds;
  const res = await fetch(`${API_BASE}/courses/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to update course');
  const data = await res.json();
  return mapCourse(data);
}

export async function deleteCourse(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/courses/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete course');
}

// ---------------------------------------------------------------------------
// Chat Sessions API
// ---------------------------------------------------------------------------

function mapChatSession(r: any): ChatSession {
  return {
    id: r.id,
    documentId: r.documentId ?? undefined,
    title: r.title ?? '',
    messages: (r.messages ?? []).map(mapChatMessage),
    createdAt: toEpoch(r.createdAt),
    updatedAt: toEpoch(r.updatedAt),
  };
}

function mapChatMessage(r: any): ChatMessage {
  return {
    id: r.id,
    role: r.role,
    content: r.content,
    citations: r.citations ?? undefined,
    timestamp: toEpoch(r.timestamp),
  };
}

export async function listChatSessions(): Promise<ChatSession[]> {
  const res = await fetch(`${API_BASE}/chat-sessions`);
  if (!res.ok) throw new Error('Failed to list chat sessions');
  const data = await res.json();
  return data.map((r: any) => mapChatSession({ ...r, messages: [] }));
}

export async function getChatSession(id: string): Promise<ChatSession> {
  const res = await fetch(`${API_BASE}/chat-sessions/${id}`);
  if (!res.ok) throw new Error('Failed to get chat session');
  const data = await res.json();
  return mapChatSession(data);
}

export async function createChatSession(title?: string, documentId?: string): Promise<ChatSession> {
  const res = await fetch(`${API_BASE}/chat-sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: `session_${Date.now()}`,
      title: title ?? '',
      document_id: documentId ?? null,
    }),
  });
  if (!res.ok) throw new Error('Failed to create chat session');
  const data = await res.json();
  return mapChatSession({ ...data, messages: [] });
}

export async function updateChatSession(id: string, updates: Partial<Pick<ChatSession, 'title' | 'documentId'>>): Promise<void> {
  const body: Record<string, unknown> = {};
  if (updates.title !== undefined) body.title = updates.title;
  if (updates.documentId !== undefined) body.documentId = updates.documentId;
  const res = await fetch(`${API_BASE}/chat-sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to update chat session');
}

export async function generateChatTitle(sessionId: string, message: string): Promise<string> {
  const res = await fetch(`${API_BASE}/chat-sessions/${sessionId}/generate-title`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error('Failed to generate chat title');
  const data = await res.json();
  return data.title;
}

export async function addChatMessage(sessionId: string, message: { id: string; role: string; content: string; citations?: any[] }): Promise<void> {
  const res = await fetch(`${API_BASE}/chat-sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: message.id,
      role: message.role,
      content: message.content,
      citations: message.citations ?? null,
    }),
  });
  if (!res.ok) throw new Error('Failed to add chat message');
}

export async function deleteChatSession(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/chat-sessions/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete chat session');
}

// ---------------------------------------------------------------------------
// Study Guides API
// ---------------------------------------------------------------------------

function mapStudyGuide(r: any): StudyGuide {
  return {
    id: r.id,
    courseId: r.courseId ?? null,
    documentId: r.documentId ?? null,
    title: r.title,
    content: r.content ?? null,
    status: r.status ?? 'pending',
    error: r.error ?? null,
    createdAt: toEpoch(r.createdAt),
    updatedAt: toEpoch(r.updatedAt),
  };
}

export async function listStudyGuides(courseId?: string, documentId?: string): Promise<StudyGuide[]> {
  const params = new URLSearchParams();
  if (courseId) params.set('courseId', courseId);
  if (documentId) params.set('documentId', documentId);
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/study-guides${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error('Failed to list study guides');
  const data = await res.json();
  return data.map(mapStudyGuide);
}

export async function getStudyGuide(id: string): Promise<StudyGuide> {
  const res = await fetch(`${API_BASE}/study-guides/${id}`);
  if (!res.ok) throw new Error('Failed to get study guide');
  return mapStudyGuide(await res.json());
}

export async function createStudyGuide(params: {
  title?: string;
  courseId?: string;
  documentId?: string;
}): Promise<StudyGuide> {
  const res = await fetch(`${API_BASE}/study-guides`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to create study guide');
  return mapStudyGuide(await res.json());
}

/**
 * Kick off AI generation for a study guide. Returns the raw `Response` whose
 * `body` is an SSE stream of progress/result events. The caller is responsible
 * for reading and parsing the stream.
 *
 * SSE events:
 *   {"type":"status","message":"…"}
 *   {"type":"materials_collected","count":N}
 *   {"type":"material_start","index":N,"total":N,"title":"…"}
 *   {"type":"material_result","index":N,"title":"…","summary":"…","keyPoints":[…],…}
 *   {"type":"synthesizing","message":"…"}
 *   {"type":"guide","guide":{…full StudyGuideContent…}}
 *   {"type":"done"}
 *   {"type":"error","message":"…"}
 */
export async function generateStudyGuide(id: string, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(`${API_BASE}/study-guides/${id}/generate`, {
    method: 'POST',
    headers: { Accept: 'text/event-stream' },
    signal,
  });
  if (!res.ok) throw new Error(`Failed to start study guide generation: ${res.status}`);
  return res;
}

export async function deleteStudyGuide(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/study-guides/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(`Failed to delete study guide: ${res.status}`);
}
