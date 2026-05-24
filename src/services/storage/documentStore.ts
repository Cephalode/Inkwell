import { getDB } from './db';
import { DocumentFile } from '../../types/document';

export async function saveDocument(doc: DocumentFile): Promise<void> {
  const db = await getDB();
  const { rawBlob, ...rest } = doc;
  const toStore = rawBlob ? { ...rest, rawBlob: await rawBlob.arrayBuffer() } : rest;
  await db.put('documents', toStore as any);
}

export async function getDocument(id: string): Promise<DocumentFile | undefined> {
  const db = await getDB();
  const doc = await db.get('documents', id);
  if (!doc) return undefined;
  const { rawBlob, ...rest } = doc as any;
  return rawBlob ? { ...rest, rawBlob: new Blob([rawBlob]) } as DocumentFile : rest as DocumentFile;
}

export async function getAllDocuments(): Promise<DocumentFile[]> {
  const db = await getDB();
  const docs = await db.getAll('documents');
  return docs.map((doc: any) => {
    const { rawBlob, ...rest } = doc;
    return rawBlob ? { ...rest, rawBlob: new Blob([rawBlob]) } as DocumentFile : rest as DocumentFile;
  });
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('documents', id);
}

export async function updateDocument(id: string, updates: Partial<DocumentFile>): Promise<void> {
  const doc = await getDocument(id);
  if (!doc) return;
  const updated = { ...doc, ...updates };
  await saveDocument(updated);
}
