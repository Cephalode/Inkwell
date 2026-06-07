import { getDB } from './db';
import { ChapterDocument } from '../../types/document';

export async function saveChapter(doc: ChapterDocument): Promise<void> {
  const db = await getDB();
  const { rawBlob, ...rest } = doc;
  const toStore = rawBlob ? { ...rest, rawBlob: await rawBlob.arrayBuffer() } : rest;
  await db.put('chapters', toStore as any);
}

export async function getChapter(id: string): Promise<ChapterDocument | undefined> {
  const db = await getDB();
  const doc = await db.get('chapters', id);
  if (!doc) return undefined;
  const { rawBlob, ...rest } = doc as any;
  return rawBlob ? { ...rest, rawBlob: new Blob([rawBlob]) } as ChapterDocument : rest as ChapterDocument;
}

export async function getChaptersByParent(parentId: string): Promise<ChapterDocument[]> {
  const db = await getDB();
  const chapters = await db.getAllFromIndex('chapters', 'by-parent', parentId);
  return chapters.map((doc: any) => {
    const { rawBlob, ...rest } = doc;
    return rawBlob ? { ...rest, rawBlob: new Blob([rawBlob]) } as ChapterDocument : rest as ChapterDocument;
  });
}

export async function deleteChapter(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('chapters', id);
}

export async function deleteChaptersByParent(parentId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('chapters', 'readwrite');
  const index = tx.store.index('by-parent');
  let cursor = await index.openCursor(parentId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}
