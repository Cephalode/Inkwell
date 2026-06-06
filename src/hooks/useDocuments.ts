import { useCallback, useState } from 'react';
import { useDocumentStore } from '../store/documentStore';
import { parseFile } from '../services/parsers/index';
import { classifyDocument } from '../services/classifyDocument';
import { uploadDocument, listDocuments, updateDocumentTags, updateDocument as updateDoc, deleteDocument as deleteDoc } from '../services/api/client';
import type { DocumentFile, DocumentType } from '../types/document';
import { SUPPORTED_MIME_TYPES, SUPPORTED_EXTENSIONS } from '../types/document';

export function useDocuments() {
  const { documents, setDocuments, addDocument, removeDocument, setLoading, isLoading } = useDocumentStore();
  const [classifyingIds, setClassifyingIds] = useState<Set<string>>(new Set());

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const docs = await listDocuments();
      setDocuments(docs);
    } finally {
      setLoading(false);
    }
  }, [setDocuments, setLoading]);

  const uploadFile = useCallback(async (file: File) => {
    setLoading(true);
    try {
      // 1. Upload to backend (returns doc with empty parsedText)
      const doc = await uploadDocument(file);

      // 2. Parse client-side for text / pages / chapters / thumbnail
      const parsed = await parseFile(file);

      // 3. Merge parsed data into the doc and update zustand store
      const enrichedDoc: DocumentFile = {
        ...doc,
        parsedText: parsed.text,
        parsedPages: parsed.pages,
        chapterMarkers: parsed.chapters,
        thumbnail: parsed.thumbnail,
        rawBlob: file,
      };
      addDocument(enrichedDoc);

      // 3b. Persist parsed text + thumbnail + chapter markers to backend
      updateDoc(doc.id, {
        parsedText: parsed.text,
        thumbnail: parsed.thumbnail ?? null,
        chapterMarkers: parsed.chapters ?? [],
      }).catch((err) => console.error('Failed to persist parsed data:', err));

      // 4. Classify in the background — update tags when done
      setClassifyingIds((prev) => new Set(prev).add(doc.id));
      classifyDocument(parsed.text)
        .then((result) => {
          if (result.label !== 'Unknown' || result.subject !== 'General') {
            const tags = [result.label, result.subject];
            updateDocumentTags(doc.id, tags);
            useDocumentStore.getState().updateDocument(doc.id, { tags });
          }
        })
        .catch((err) => console.error('Classification failed:', err))
        .finally(() => {
          setClassifyingIds((prev) => { const next = new Set(prev); next.delete(doc.id); return next; });
        });

      return enrichedDoc;
    } catch (err) {
      console.error('Upload failed:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [addDocument, setLoading]);

  const deleteDocumentById = useCallback(async (id: string) => {
    await deleteDoc(id);
    removeDocument(id);
  }, [removeDocument]);

  return { documents, isLoading, classifyingIds, loadDocuments, uploadFile, deleteDocumentById };
}

function getDocType(file: File): DocumentType {
  if (SUPPORTED_MIME_TYPES[file.type]) return SUPPORTED_MIME_TYPES[file.type];
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (ext && SUPPORTED_EXTENSIONS[ext]) return SUPPORTED_EXTENSIONS[ext];
  return 'txt';
}
