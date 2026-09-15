import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HiSparkles, HiBookOpen, HiDocumentText } from 'react-icons/hi';
import TextbookViewer from '../components/textbook/TextbookViewer';
import ChapterSelector from '../components/textbook/ChapterSelector';
import ChapterAnalysisPanel from '../components/textbook/ChapterAnalysisPanel';
import Card from '../components/shared/Card';
import Button from '../components/shared/Button';
import EmptyState from '../components/shared/EmptyState';
import Spinner from '../components/shared/Spinner';
import { useTextbook } from '../hooks/useTextbook';
import { useChapters } from '../hooks/useChapters';
import { useDocumentStore } from '../store/documentStore';
import { downloadDocumentFile, convertToTextbook, listTextbooks } from '../services/api/client';
import type { Chapter, Textbook, DocumentFile } from '../types/document';

export default function TextbookPage() {
  const { documents, currentDocument, setCurrentDocument, setCurrentChapter, setChapterText, clearCurrentChapter, setViewerPage } = useDocumentStore();
  const pdfs = documents.filter((d) => d.type === 'pdf');
  const { pageCount, endPage, loadPDF, selectPageRange, setStartPage, setEndPage } = useTextbook();
  const { chapters, isExtracting, isSaving, savingIndex, savedCount, savedChapters, savedChapterDocs, error: chapterError, extractChapters, clearChapters, initChapters, saveSingleChapter, saveAllChapters } = useChapters(currentDocument);
  const [pageLoaded, setPageLoaded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [chapterLocalPage, setChapterLocalPage] = useState(1);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [isConverting, setIsConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  // ── Server-side textbook mode ─────────────────────────────────────────
  const [serverTextbooks, setServerTextbooks] = useState<Textbook[]>([]);
  const [loadedTextbook, setLoadedTextbook] = useState<Textbook | null>(null);
  const [chapterBlob, setChapterBlob] = useState<Blob | null>(null);
  const [chapterPageCount, setChapterPageCount] = useState(0);
  const [chapterBlobLoading, setChapterBlobLoading] = useState(false);

  // ── URL-based persistence (Feature 2) ─────────────────────────────────
  const [searchParams, setSearchParams] = useSearchParams();
  const restoredRef = useRef(false);

  /** Imperatively update URL search params (replace, so no history spam). */
  const updateUrlParams = useCallback(
    (updates: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(updates)) {
            if (v === null || v === undefined) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Fetch server-side textbooks on mount and after conversion
  useEffect(() => {
    listTextbooks()
      .then(setServerTextbooks)
      .catch(() => {});
  }, [pageLoaded]);

  const handleSelectPDF = async (doc: DocumentFile) => {
    setCurrentDocument(doc);
    setLoadedTextbook(null);
    setSelectedChapter(null);
    setChapterBlob(null);
    clearCurrentChapter();
    updateUrlParams({ doc: doc.id, chapter: null, page: null });
    let blob = doc.rawBlob;
    if (!blob) {
      blob = await downloadDocumentFile(doc.id);
      doc.rawBlob = blob;
    }
    await loadPDF(blob);
    setPageLoaded(true);
  };

  const handleSelectServerTextbook = (tb: Textbook) => {
    setLoadedTextbook(tb);
    setCurrentDocument(null);
    setSelectedChapter(null);
    setChapterBlob(null);
    setPageLoaded(false);
    clearCurrentChapter();
    updateUrlParams({ doc: tb.id, chapter: null, page: null });
  };

  const handleSelectChapterDocument = async (doc: DocumentFile) => {
    setChapterBlobLoading(true);
    try {
      const blob = await downloadDocumentFile(doc.id);
      setChapterBlob(blob);
      const { getPDFPageCount } = await import('../services/parsers/index');
      const count = await getPDFPageCount(blob);
      setChapterPageCount(count);
      const title = doc.name.replace(/^\d+\s+/, '').replace(/\.pdf$/i, '');
      setSelectedChapter({ title, page: 1 });
      setChapterLocalPage(1);
      setShowAnalysis(true);
      setSelectedChapterId(doc.id);
      // ── Store wiring (Feature 1): lift chapter into documentStore
      const tbId = doc.textbookId ?? loadedTextbook?.id ?? '';
      setCurrentChapter({ id: doc.id, title, parentId: tbId, textbookId: tbId });
      // Make the chapter's parsed text directly available to the chat agent so
      // it can answer questions about what's on screen without a tool call.
      // (Converted-textbook chapters live in the `documents` table and carry
      // parsedText, but their id is a document UUID — get_chapter would 404.)
      setChapterText(doc.parsedText ?? null);
      setViewerPage(1);
      // ── URL persistence (Feature 2)
      updateUrlParams({ doc: tbId, chapter: doc.id, page: '1' });
    } catch (err) {
      console.error('Failed to load chapter PDF:', err);
    } finally {
      setChapterBlobLoading(false);
    }
  };

  const handleSwitchDocument = () => {
    setCurrentDocument(null);
    setLoadedTextbook(null);
    setSelectedChapter(null);
    setChapterBlob(null);
    setPageLoaded(false);
    clearCurrentChapter();
    updateUrlParams({ doc: null, chapter: null, page: null });
  };

  const handleSelectChapter = (ch: Chapter) => {
    setSelectedChapter(ch);
    setChapterLocalPage(1);
    setStartPage(ch.page);
    const idx = chapters.findIndex((c) => c.title === ch.title && c.page === ch.page);
    const endPageNum = idx + 1 < chapters.length ? chapters[idx + 1].page - 1 : pageCount;
    setEndPage(endPageNum);
    const saved = idx >= 0 ? savedChapterDocs.find((c) => c.chapterIndex === idx) : undefined;
    setSelectedChapterId(saved?.id ?? null);
    setShowAnalysis(true);
    if (currentDocument?.rawBlob) {
      selectPageRange(currentDocument.rawBlob, ch.page, endPageNum);
    }
    // ── Store wiring (Feature 1): lift chapter into documentStore
    const chapId = saved?.id ?? `local:${ch.title}:${ch.page}`;
    setCurrentChapter({
      id: chapId,
      title: ch.title,
      parentId: currentDocument?.id ?? '',
    });
    // Provide the saved chapter's parsed text to the agent if available.
    setChapterText(saved?.parsedText ?? null);
    setViewerPage(1);
    // ── URL persistence (Feature 2)
    updateUrlParams({
      doc: currentDocument?.id ?? null,
      chapter: saved?.id ?? null,
      page: '1',
    });
  };

  const handleCloseChapter = () => {
    setSelectedChapter(null);
    setSelectedChapterId(null);
    setChapterBlob(null);
    clearCurrentChapter();
    updateUrlParams({ chapter: null, page: null });
  };

  const handleConvertToTextbook = async () => {
    if (!currentDocument) return;
    setIsConverting(true);
    setConvertError(null);
    try {
      const { removeDocument } = useDocumentStore.getState();
      await convertToTextbook(currentDocument.id);
      removeDocument(currentDocument.id);
      setCurrentDocument(null);
      setSelectedChapter(null);
      setPageLoaded(false);
      clearCurrentChapter();
      updateUrlParams({ doc: null, chapter: null, page: null });
      // Refresh server textbook list
      const tbs = await listTextbooks();
      setServerTextbooks(tbs);
      if (tbs.length > 0) setLoadedTextbook(tbs[0]);
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : 'Failed to convert');
    } finally {
      setIsConverting(false);
    }
  };

  // Load cached chapter markers when document changes
  useEffect(() => {
    if (currentDocument) {
      initChapters();
    }
  }, [currentDocument, initChapters]);

  // ── Keep the store's viewerPage in sync with the local chapter page ────
  useEffect(() => {
    if (selectedChapter) {
      setViewerPage(chapterLocalPage);
    }
  }, [chapterLocalPage, selectedChapter, setViewerPage]);

  // Clear the store's chapter context when the page unmounts
  useEffect(() => {
    return () => {
      useDocumentStore.getState().clearCurrentChapter();
    };
  }, []);

  /** Page change within an open chapter — syncs local state, store, and URL. */
  const handleChapterPageChange = (p: number) => {
    setChapterLocalPage(p);
    setViewerPage(p);
    updateUrlParams({ page: String(p) });
  };

  // ── Restore the open chapter/page from URL params on mount (Feature 2) ──
  // Runs once server textbooks / local PDFs have loaded. If no params are
  // present the page behaves exactly as before (empty picker state).
  useEffect(() => {
    if (restoredRef.current) return;
    const docParam = searchParams.get('doc');
    const chapterParam = searchParams.get('chapter');
    const pageParam = searchParams.get('page');
    if (!docParam) return;

    // Mode 2: server textbook (optionally with a specific chapter)
    const tb = serverTextbooks.find((t) => t.id === docParam);
    if (tb) {
      restoredRef.current = true;
      setLoadedTextbook(tb);
      setCurrentDocument(null);
      clearCurrentChapter();
      if (chapterParam) {
        const chapDoc = tb.documents.find((d) => d.id === chapterParam);
        if (chapDoc) {
          // handleSelectChapterDocument is async; restore the page after it
          void handleSelectChapterDocument(chapDoc).then(() => {
            if (pageParam) {
              const p = Number(pageParam);
              if (Number.isFinite(p) && p > 0) {
                setChapterLocalPage(p);
                setViewerPage(p);
                updateUrlParams({ page: String(p) });
              }
            }
          });
        }
      }
      return;
    }

    // Mode 1: local PDF (best-effort — restores the open document)
    const pdf = pdfs.find((d) => d.id === docParam);
    if (pdf) {
      restoredRef.current = true;
      void handleSelectPDF(pdf);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverTextbooks, pdfs]);

  // ── No PDFs and no server textbooks ─────────────────────────────────────
  if (pdfs.length === 0 && serverTextbooks.length === 0) {
    return (
      <div className="space-y-4 overflow-x-auto">
        <div>
          <div className="card-kicker" style={{ fontSize: 13 }}>Reader</div>
          <h1 className="text-xl sm:text-2xl" style={{ margin: 'var(--space-1) 0 0' }}>Textbook Study</h1>
        </div>
        <EmptyState icon="📕" title="No PDF textbooks uploaded" description="Upload a PDF to use the textbook study feature" action={{ label: 'Upload PDF', onClick: () => window.location.href = '/documents' }} />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <div className="card-kicker" style={{ fontSize: 13 }}>Reader</div>
        <h1 className="text-xl sm:text-2xl" style={{ margin: 'var(--space-1) 0 var(--space-1)' }}>Textbook Study</h1>
        <p style={{ opacity: 0.6 }}>Select a page range and ask questions about only those pages</p>
      </div>

      {/* ── Document / Textbook picker ────────────────────────────────────── */}
      {!currentDocument && !loadedTextbook ? (
        <div className="space-y-4">
          {/* Server-side textbooks (converted) */}
          {serverTextbooks.length > 0 && (
            <div>
              <h3 className="section-label mb-2 flex items-center gap-2">
                <HiBookOpen className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
                Textbooks
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {serverTextbooks.map((tb) => (
                  <Card key={tb.id} onClick={() => handleSelectServerTextbook(tb)} className="cursor-pointer">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl shrink-0">📖</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{tb.name}</p>
                        <p className="text-xs" style={{ opacity: 0.5 }}>{tb.documents.length} chapter{tb.documents.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
          {/* Local PDFs for chapter extraction */}
          {pdfs.length > 0 && (
            <div>
              {serverTextbooks.length > 0 && (
                <h3 className="section-label mb-2">Or extract chapters from a new PDF</h3>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pdfs.map((doc) => (
                  <Card key={doc.id} onClick={() => handleSelectPDF(doc)} className="cursor-pointer">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl shrink-0">📄</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{doc.name}</p>
                        <p className="text-xs" style={{ opacity: 0.5 }}>{(doc.size / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : selectedChapter && (currentDocument || chapterBlob) ? (
        /* ── Chapter sub-page ─────────────────────────────────────────────── */
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleCloseChapter} variant="secondary">← Back to textbook</Button>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-sm truncate" style={{ opacity: 0.6 }}>{currentDocument?.name || loadedTextbook?.name}</span>
              <span style={{ opacity: 0.4 }}>/</span>
              <span className="text-sm font-medium truncate" style={{ color: 'var(--color-accent-700)' }}>{selectedChapter.title}</span>
            </div>
            {selectedChapterId && (
              <Button
                onClick={() => setShowAnalysis((v) => !v)}
                variant={showAnalysis ? 'primary' : 'ghost'}
                size="sm"
              >
                <HiSparkles className="w-4 h-4" />
                AI Analysis
              </Button>
            )}
          </div>
          <div>
            {chapterBlob ? (
              <TextbookViewer
                file={chapterBlob}
                currentPage={chapterLocalPage}
                onPageChange={handleChapterPageChange}
                totalPages={chapterPageCount}
              />
            ) : currentDocument?.rawBlob ? (
              <TextbookViewer
                file={currentDocument.rawBlob}
                currentPage={chapterLocalPage}
                onPageChange={handleChapterPageChange}
                totalPages={endPage - selectedChapter.page + 1}
                pageOffset={selectedChapter.page - 1}
              />
            ) : null}
          </div>
          {chapterBlobLoading && (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          )}
          {selectedChapterId && showAnalysis && (
            <ChapterAnalysisPanel chapterId={selectedChapterId} />
          )}
        </>
      ) : currentDocument ? (
        /* ── Full textbook view (local PDF, chapter extraction) ───────────── */
        <>
          <div className="flex items-center gap-3">
            <Button onClick={handleSwitchDocument} variant="secondary">← Switch Document</Button>
            <span className="text-sm truncate" style={{ opacity: 0.6 }}>{currentDocument.name}</span>
          </div>
          <div className="space-y-4">
            <TextbookViewer file={currentDocument.rawBlob || null} currentPage={currentPage} onPageChange={setCurrentPage} totalPages={pageCount} />
            <ChapterSelector
              chapters={chapters}
              totalPages={pageCount}
              isExtracting={isExtracting}
              isSaving={isSaving}
              savingIndex={savingIndex}
              savedCount={savedCount}
              savedChapters={savedChapters}
              error={chapterError}
              onExtractChapters={extractChapters}
              onClearChapters={() => { clearChapters(); setSelectedChapter(null); clearCurrentChapter(); updateUrlParams({ chapter: null, page: null }); }}
              onSelectChapter={handleSelectChapter}
              onSaveChapter={(i) => saveSingleChapter(i, pageCount)}
              onSaveAllChapters={() => saveAllChapters(pageCount)}
            />
            {savedCount === chapters.length && chapters.length > 0 && (
              <div className="card p-3 sm:p-5">
                <div className="flex items-center gap-3 mb-2">
                  <HiBookOpen className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
                  <h4 className="text-sm">Chapter View</h4>
                </div>
                <p className="text-xs mb-3" style={{ opacity: 0.6 }}>
                  Convert all {chapters.length} chapters into individual documents. The original PDF will be removed.
                  Chapters will appear as a single textbook in the Documents page.
                </p>
                {convertError && (
                  <p className="text-xs mb-3" style={{ color: 'var(--color-danger)' }}>{convertError}</p>
                )}
                <Button
                  onClick={handleConvertToTextbook}
                  disabled={isConverting}
                  className="w-full"
                >
                  {isConverting ? (
                    <>
                      <Spinner size="sm" />
                      Converting…
                    </>
                  ) : (
                    <>
                      <HiBookOpen className="w-4 h-4" />
                      Convert to Chapter View
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </>
      ) : loadedTextbook ? (
        /* ── Server textbook view (converted chapters) ────────────────────── */
        <>
          <div className="flex items-center gap-3">
            <Button onClick={handleSwitchDocument} variant="secondary">← Back</Button>
            <HiBookOpen className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
            <span className="text-sm font-medium truncate">{loadedTextbook.name}</span>
          </div>
          {chapterBlobLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner />
            </div>
          ) : chapterBlob && selectedChapter ? (
            <>
              <div>
                <TextbookViewer
                  file={chapterBlob}
                  currentPage={chapterLocalPage}
                  onPageChange={handleChapterPageChange}
                  totalPages={chapterPageCount}
                />
              </div>
              {selectedChapterId && showAnalysis && (
                <ChapterAnalysisPanel chapterId={selectedChapterId} />
              )}
            </>
          ) : (
            <div className="space-y-3">
              <h3 className="section-label">
                {loadedTextbook.documents.length} chapter{loadedTextbook.documents.length !== 1 ? 's' : ''}
              </h3>
              <div className="card overflow-hidden">
                {/* Table header */}
                <div
                  className="grid grid-cols-[3rem_1fr_4.5rem_6rem] gap-3 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider"
                  style={{ opacity: 0.5, borderBottom: '1px solid var(--color-divider)' }}
                >
                  <div>#</div>
                  <div>Title</div>
                  <div className="text-right">Size</div>
                  <div className="text-right">Chars</div>
                </div>
                {/* Chapter rows */}
                {loadedTextbook.documents.map((doc, i) => {
                  const match = doc.name.match(/^(\d+)/);
                  const chapterNum = match ? match[1] : String(i + 1).padStart(2, '0');
                  const title = doc.name.replace(/^\d+\s*/, '').replace(/\.pdf$/i, '') || doc.name;
                  const sizeKB = doc.size > 0 ? Math.round(doc.size / 1024) : 0;
                  const chars = doc.parsedText ? doc.parsedText.length : 0;
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => handleSelectChapterDocument(doc)}
                      className="w-full grid grid-cols-[3rem_1fr_4.5rem_6rem] gap-3 items-center px-4 py-3 text-left border-b last:border-b-0 hover:bg-[var(--color-neutral-200)] transition-colors group"
                      style={{ borderColor: 'var(--color-neutral-300)' }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <HiDocumentText className="w-4 h-4 shrink-0" style={{ color: 'var(--color-accent)', opacity: 0.8 }} />
                        <span className="font-mono text-sm tabular-nums" style={{ opacity: 0.5 }}>{chapterNum}</span>
                      </div>
                      <p className="text-sm truncate group-hover:text-[var(--color-accent-700)] transition-colors">{title}</p>
                      <span className="text-right text-xs tabular-nums" style={{ opacity: 0.5 }}>
                        {sizeKB > 0 ? `${sizeKB} KB` : '—'}
                      </span>
                      <span className="text-right text-xs tabular-nums" style={{ opacity: 0.5 }}>
                        {chars > 0 ? chars.toLocaleString() : '—'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
