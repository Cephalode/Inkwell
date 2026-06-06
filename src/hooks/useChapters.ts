import { useState, useCallback, useEffect } from 'react';
import { DocumentFile, ChapterDocument } from '../types/document';
import { listChapters, uploadChapters, deleteChapters as deleteChaptersApi } from '../services/api/client';
import { splitPDFIntoChapters } from '../services/chapterExtractor';
import { useDocumentStore } from '../store/documentStore';

export function useChapters(parentDoc: DocumentFile | null) {
  const [chapters, setChapters] = useState<ChapterDocument[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { updateDocument } = useDocumentStore();

  const loadChapters = useCallback(async () => {
    if (!parentDoc) return;
    const found = await listChapters(parentDoc.id);
    setChapters(found);
  }, [parentDoc]);

  useEffect(() => { loadChapters(); }, [loadChapters]);

  const extractChapters = useCallback(async () => {
    if (!parentDoc) return;
    setIsExtracting(true);
    setError(null);
    try {
      // 1. Delete old chapters from backend
      await deleteChaptersApi(parentDoc.id);

      // 2. Split PDF client-side (needs rawBlob)
      const extracted = await splitPDFIntoChapters(parentDoc);
      if (extracted.length === 0) {
        setChapters([]);
        return;
      }

      // 3. Build upload payload for backend
      const payload = extracted.map((ch) => ({
        blob: ch.rawBlob!,
        metadata: {
          chapterTitle: ch.chapterTitle,
          chapterIndex: ch.chapterIndex,
          startPage: ch.startPage,
          endPage: ch.endPage,
          parsedText: ch.parsedText,
          tags: ch.tags,
        },
      }));

      // 4. Upload to backend
      const saved = await uploadChapters(parentDoc.id, payload);

      // 5. Update state
      setChapters(saved);
      const markers = saved.map((c) => ({ title: c.chapterTitle, page: c.startPage }));
      updateDocument(parentDoc.id, { chapterMarkers: markers });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract chapters');
    } finally {
      setIsExtracting(false);
    }
  }, [parentDoc, updateDocument]);

  return { chapters, isExtracting, error, extractChapters, loadChapters };
}
