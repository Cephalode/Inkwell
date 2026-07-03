import { useCallback, useEffect, useRef } from 'react';
import { useDocumentStore } from '../store/documentStore';
import { parseFile } from '../services/parsers/index';
import { classifyDocument, createDocumentFromUrl, getDocument, listDocuments, updateDocumentTags, updateDocument as updateDoc, deleteDocument as deleteDoc, uploadDocument } from '../services/api/client';
import type { DocumentFile, DocumentType } from '../types/document';
import { SUPPORTED_MIME_TYPES, SUPPORTED_EXTENSIONS } from '../types/document';

export function useDocuments() {
  const { documents, setDocuments, addDocument, removeDocument, updateDocument, setLoading, isLoading } = useDocumentStore();
  const resumedRef = useRef(false);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const docs = await listDocuments();
      setDocuments(docs);
    } finally {
      setLoading(false);
    }
  }, [setDocuments, setLoading]);

  // Resume stuck classifications on mount
  useEffect(() => {
    if (resumedRef.current || documents.length === 0) return;
    resumedRef.current = true;

    const pending = documents.filter((d) => d.classifyStatus === 'classifying' || d.classifyStatus === 'pending');
    for (const doc of pending) {
      triggerClassify(doc.id);
    }
  }, [documents]);

  const triggerClassify = (id: string) => {
    updateDocument(id, { classifyStatus: 'classifying' as any });
    classifyDocument(id)
      .then(async () => {
        // Re-fetch the doc to get updated tags + name + status
        const updated = await getDocument(id);
        updateDocument(id, { tags: updated.tags ?? [], name: updated.name, classifyStatus: updated.classifyStatus });
      })
      .catch((err) => {
        console.error('Classification failed:', err);
        updateDocument(id, { classifyStatus: 'skipped' as any });
      });
  };

  const uploadFile = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const doc = await uploadDocument(file);

      const parsed = await parseFile(file);

      const enrichedDoc: DocumentFile = {
        ...doc,
        parsedText: parsed.text,
        parsedPages: parsed.pages,
        chapterMarkers: parsed.chapters,
        thumbnail: parsed.thumbnail,
        rawBlob: file,
        classifyStatus: 'classifying',
      };
      addDocument(enrichedDoc);

      // Persist parsed text to DB first — classify endpoint reads parsed_text from DB
      await updateDoc(doc.id, {
        parsedText: parsed.text,
        thumbnail: parsed.thumbnail ?? null,
        chapterMarkers: parsed.chapters ?? [],
      }).catch((err) => console.error('Failed to persist parsed data:', err));

      // Classify server-side (parsed_text is now guaranteed in DB)
      classifyDocument(doc.id)
        .then(async () => {
          const updated = await getDocument(doc.id);
          updateDocument(doc.id, { tags: updated.tags ?? [], name: updated.name, classifyStatus: updated.classifyStatus });
        })
        .catch((err) => {
          console.error('Classification failed:', err);
          updateDocument(doc.id, { classifyStatus: 'skipped' as any });
        });

      return enrichedDoc;
    } catch (err) {
      console.error('Upload failed:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [addDocument, setLoading, updateDocument]);

  const uploadVideoUrl = useCallback(async (url: string) => {
    setLoading(true);
    try {
      const doc = await createDocumentFromUrl(url);
      addDocument(doc);
      // Classification happens server-side automatically — poll for completion
      setTimeout(async () => {
        try {
          const updated = await getDocument(doc.id);
          updateDocument(doc.id, {
            tags: updated.tags ?? [],
            name: updated.name,
            classifyStatus: updated.classifyStatus,
            videoSummary: updated.videoSummary,
          });
        } catch {
          /* classification may still be in-flight; non-fatal */
        }
      }, 5000);
      return doc;
    } catch (err) {
      console.error('Video URL processing failed:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [addDocument, updateDocument, setLoading]);

  const deleteDocumentById = useCallback(async (id: string) => {
    await deleteDoc(id);
    removeDocument(id);
  }, [removeDocument]);

  return { documents, isLoading, loadDocuments, uploadFile, uploadVideoUrl, deleteDocumentById };
}

function getDocType(file: File): DocumentType {
  if (SUPPORTED_MIME_TYPES[file.type]) return SUPPORTED_MIME_TYPES[file.type];
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (ext && SUPPORTED_EXTENSIONS[ext]) return SUPPORTED_EXTENSIONS[ext];
  return 'txt';
}
