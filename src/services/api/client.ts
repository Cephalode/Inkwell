import type { DocumentFile, ChapterDocument } from '../../types/document';

const API_BASE = '/api';

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

export async function updateDocumentTags(id: string, tags: string[]): Promise<void> {
  const res = await fetch(`${API_BASE}/documents/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
  if (!res.ok) throw new Error(`Failed to update tags: ${res.status}`);
}

export async function updateDocument(id: string, updates: { parsedText?: string; thumbnail?: string; chapterMarkers?: Array<{ title: string; page: number }>; tags?: string[] }): Promise<void> {
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
