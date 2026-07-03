import { useState, useCallback } from 'react';
import { DocumentFile, Chapter, ChapterDocument } from '../types/document';
import { detectChapters, splitPDF } from '../services/chapterExtractor';
import { useDocumentStore } from '../store/documentStore';
import { uploadSingleChapter, listChapters, deleteChapters, updateDocument, downloadDocumentFile } from '../services/api/client';

async function getPDFPageCount(blob: Blob): Promise<number> {
  const arrayBuffer = await blob.arrayBuffer();
  const pdfjsLib = await import('pdfjs-dist');
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  return pdf.numPages;
}

export function useChapters(parentDoc: DocumentFile | null) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [savedChapters, setSavedChapters] = useState<Set<number>>(new Set());
  const [savedChapterDocs, setSavedChapterDocs] = useState<ChapterDocument[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savingIndex, setSavingIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const storeUpdateDocument = useDocumentStore((s) => s.updateDocument);

  const loadSavedChapters = useCallback(async () => {
    if (!parentDoc) return;
    try {
      const serverChapters = await listChapters(parentDoc.id);
      setSavedChapters(new Set(serverChapters.map((c) => c.chapterIndex)));
      setSavedChapterDocs(serverChapters);
      setSavedCount(serverChapters.length);
    } catch {
      // No saved chapters yet — fine
    }
  }, [parentDoc]);

  const initChapters = useCallback(() => {
    if (parentDoc?.chapterMarkers?.length) {
      setChapters(parentDoc.chapterMarkers);
    }
    loadSavedChapters();
  }, [parentDoc, loadSavedChapters]);

  const extractChapters = useCallback(async () => {
    if (!parentDoc) return;
    setIsExtracting(true);
    setError(null);
    try {
      const detected = await detectChapters(parentDoc);
      setChapters(detected);
      storeUpdateDocument(parentDoc.id, { chapterMarkers: detected });
      updateDocument(parentDoc.id, { chapterMarkers: detected }).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to detect chapters');
    } finally {
      setIsExtracting(false);
    }
  }, [parentDoc, storeUpdateDocument]);

  const clearChapters = useCallback(async () => {
    if (!parentDoc) return;
    setChapters([]);
    setSavedCount(0);
    setSavedChapters(new Set());
    setSavedChapterDocs([]);
    storeUpdateDocument(parentDoc.id, { chapterMarkers: [] });
    await updateDocument(parentDoc.id, { chapterMarkers: [] }).catch(() => {});
    await deleteChapters(parentDoc.id).catch(() => {});
  }, [parentDoc]);

  const saveChapter = useCallback(async (chapterIndex: number, totalPages: number) => {
    if (!parentDoc) throw new Error('No PDF data available');
    const ch = chapters[chapterIndex];
    if (!ch) return;

    // Get the source PDF blob — either from memory or download from server
    const blob = parentDoc.rawBlob
      ? parentDoc.rawBlob
      : await downloadDocumentFile(parentDoc.id);

    // Compute total pages if not provided (e.g. viewer not loaded)
    const pages = totalPages > 0 ? totalPages : await getPDFPageCount(blob);

    const startPage = ch.page;
    const endPage = chapterIndex + 1 < chapters.length ? chapters[chapterIndex + 1].page - 1 : pages;

    const splitBlob = await splitPDF(blob, startPage, endPage);
    await uploadSingleChapter(parentDoc.id, splitBlob, {
      chapterTitle: ch.title,
      chapterIndex,
      startPage,
      endPage,
      tags: [...parentDoc.tags],
    });
  }, [parentDoc, chapters]);

  const saveSingleChapter = useCallback(async (chapterIndex: number, totalPages: number) => {
    setSavingIndex(chapterIndex);
    try {
      await saveChapter(chapterIndex, totalPages);
      setSavedChapters((prev) => new Set([...prev, chapterIndex]));
      setSavedCount((c) => c + 1);
      // Refresh the saved-chapter documents so the new chapter ID is available.
      loadSavedChapters();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save chapter');
    } finally {
      setSavingIndex(-1);
    }
  }, [saveChapter, loadSavedChapters]);

  const saveAllChapters = useCallback(async (totalPages: number) => {
    setIsSaving(true);
    setError(null);
    try {
      const newlySaved = new Set(savedChapters);

      // Download the PDF once if we don't have it in memory
      let blob: Blob | null = null;
      if (!parentDoc?.rawBlob) {
        blob = await downloadDocumentFile(parentDoc!.id);
      }

      const pages = totalPages > 0 ? totalPages : blob ? await getPDFPageCount(blob) : totalPages;

      for (let i = 0; i < chapters.length; i++) {
        if (newlySaved.has(i)) continue;
        setSavingIndex(i);

        const ch = chapters[i];
        if (!ch) continue;

        const sourceBlob = parentDoc?.rawBlob || blob!;
        const startPage = ch.page;
        const endPage = i + 1 < chapters.length ? chapters[i + 1].page - 1 : pages;

        const splitBlob = await splitPDF(sourceBlob, startPage, endPage);
        await uploadSingleChapter(parentDoc!.id, splitBlob, {
          chapterTitle: ch.title,
          chapterIndex: i,
          startPage,
          endPage,
          tags: [...(parentDoc?.tags || [])],
        });

        newlySaved.add(i);
        setSavedChapters(new Set(newlySaved));
      }
      setSavedCount(newlySaved.size);
      // Refresh saved-chapter documents so newly-saved IDs are available.
      loadSavedChapters();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save chapters');
    } finally {
      setIsSaving(false);
      setSavingIndex(-1);
    }
  }, [chapters, savedChapters, parentDoc, loadSavedChapters]);

  return {
    chapters, isExtracting, isSaving, savingIndex, savedCount, savedChapters, savedChapterDocs,
    error, extractChapters, clearChapters, initChapters,
    saveSingleChapter, saveAllChapters,
  };
}
