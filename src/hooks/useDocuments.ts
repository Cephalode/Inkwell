import { useCallback, useEffect, useRef } from 'react';
import { useDocumentStore } from '../store/documentStore';
import { parseFile } from '../services/parsers/index';
import { classifyDocument, createDocumentFromUrl, getDocument, listDocuments, updateDocument as updateDoc, deleteDocument as deleteDoc, uploadDocument } from '../services/api/client';
import type { DocumentFile, ClassifyStatus, ParsedDocument } from '../types/document';

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

  const triggerClassify = useCallback((id: string) => {
    updateDocument(id, { classifyStatus: 'classifying' as ClassifyStatus });
    classifyDocument(id)
      .then(async () => {
        // Re-fetch the doc to get updated tags + name + status
        const updated = await getDocument(id);
        updateDocument(id, { tags: updated.tags ?? [], name: updated.name, classifyStatus: updated.classifyStatus });
      })
      .catch((err) => {
        console.error('Classification failed:', err);
        updateDocument(id, { classifyStatus: 'skipped' as ClassifyStatus });
      });
  }, [updateDocument]);

  // Resume stuck classifications on mount
  useEffect(() => {
    if (resumedRef.current || documents.length === 0) return;
    resumedRef.current = true;

    const pending = documents.filter((d) => d.classifyStatus === 'classifying' || d.classifyStatus === 'pending');
    for (const doc of pending) {
      triggerClassify(doc.id);
    }
  }, [documents, triggerClassify]);

  const uploadFile = useCallback(async (file: File, folderId: string | null = null) => {
    setLoading(true);
    try {
      const doc = await uploadDocument(file, folderId);

      // Parse client-side for display/RAG — but never let a parse failure
      // abort the upload: the server already stored the file, so the card
      // must still appear (with empty parsed text) instead of ghosting.
      let parsed: ParsedDocument = { text: '' };
      try {
        parsed = await parseFile(file);
      } catch (parseErr) {
        console.error('parseFile failed (upload continues):', parseErr);
      }

      // Media placeholders ("[Video file: …]", "[Audio transcription …]") are
      // not content — persist empty parsed_text so the server-side classify →
      // summary → podcast chain skips instead of generating junk from a stub.
      const isMedia = file.type.startsWith('audio/') || file.type.startsWith('video/');
      const persistText = isMedia && parsed.text.startsWith('[') ? '' : parsed.text;

      const enrichedDoc: DocumentFile = {
        ...doc,
        parsedText: persistText,
        parsedPages: parsed.pages,
        chapterMarkers: parsed.chapters,
        thumbnail: parsed.thumbnail,
        rawBlob: file,
        classifyStatus: 'classifying',
      };
      addDocument(enrichedDoc);

      // Persist parsed text to DB first — classify endpoint reads parsed_text from DB
      await updateDoc(doc.id, {
        parsedText: persistText,
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
          updateDocument(doc.id, { classifyStatus: 'skipped' as ClassifyStatus });
        });

      return enrichedDoc;
    } catch (err) {
      console.error('Upload failed:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [addDocument, setLoading, updateDocument]);

  const uploadVideoUrl = useCallback(async (url: string, folderId?: string | null) => {
    setLoading(true);
    try {
      const doc = await createDocumentFromUrl(url, folderId);
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
            summary: updated.summary,
            summaryStatus: updated.summaryStatus,
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
