import { useState, useEffect } from 'react';
import { HiSparkles, HiBookOpen } from 'react-icons/hi';
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
  const { documents, currentDocument, setCurrentDocument } = useDocumentStore();
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
  };

  const handleSelectChapterDocument = async (doc: DocumentFile) => {
    setChapterBlobLoading(true);
    try {
      const blob = await downloadDocumentFile(doc.id);
      setChapterBlob(blob);
      const { getPDFPageCount } = await import('../services/parsers/index');
      const count = await getPDFPageCount(blob);
      setChapterPageCount(count);
      setSelectedChapter({
        title: doc.name.replace(/^\d+\s+/, '').replace(/\.pdf$/i, ''),
        page: 1,
      });
      setChapterLocalPage(1);
      setShowAnalysis(true);
      setSelectedChapterId(doc.id);
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
  };

  const handleCloseChapter = () => {
    setSelectedChapter(null);
    setSelectedChapterId(null);
    setChapterBlob(null);
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

  // ── No PDFs and no server textbooks ─────────────────────────────────────
  if (pdfs.length === 0 && serverTextbooks.length === 0) {
    return (
      <div className="space-y-4 overflow-x-auto">
        <h1 className="text-xl sm:text-2xl font-bold text-white">📚 Textbook Study</h1>
        <EmptyState icon="📕" title="No PDF textbooks uploaded" description="Upload a PDF to use the textbook study feature" action={{ label: 'Upload PDF', onClick: () => window.location.href = '/documents' }} />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">📚 Textbook Study</h1>
        <p className="text-slate-400">Select a page range and ask questions about only those pages</p>
      </div>

      {/* ── Document / Textbook picker ────────────────────────────────────── */}
      {!currentDocument && !loadedTextbook ? (
        <div className="space-y-4">
          {/* Server-side textbooks (converted) */}
          {serverTextbooks.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
                <HiBookOpen className="w-4 h-4 text-cyan-400" />
                Textbooks
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {serverTextbooks.map((tb) => (
                  <Card key={tb.id} onClick={() => handleSelectServerTextbook(tb)} className="hover:scale-[1.02] transition-transform cursor-pointer">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">📖</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-200">{tb.name}</p>
                        <p className="text-xs text-slate-500">{tb.documents.length} chapter{tb.documents.length !== 1 ? 's' : ''}</p>
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
                <h3 className="text-sm font-semibold text-slate-300 mb-2">Or extract chapters from a new PDF</h3>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pdfs.map((doc) => (
                  <Card key={doc.id} onClick={() => handleSelectPDF(doc)} className="hover:scale-[1.02] transition-transform cursor-pointer">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">📄</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-200">{doc.name}</p>
                        <p className="text-xs text-slate-500">{(doc.size / 1024 / 1024).toFixed(1)} MB</p>
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
              <span className="text-sm text-slate-400 truncate">{currentDocument?.name || loadedTextbook?.name}</span>
              <span className="text-slate-600">/</span>
              <span className="text-sm font-medium text-cyan-300 truncate">{selectedChapter.title}</span>
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
                onPageChange={setChapterLocalPage}
                totalPages={chapterPageCount}
              />
            ) : currentDocument?.rawBlob ? (
              <TextbookViewer
                file={currentDocument.rawBlob}
                currentPage={chapterLocalPage}
                onPageChange={setChapterLocalPage}
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
            <span className="text-sm text-slate-400 truncate">{currentDocument.name}</span>
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
              onClearChapters={() => { clearChapters(); setSelectedChapter(null); }}
              onSelectChapter={handleSelectChapter}
              onSaveChapter={(i) => saveSingleChapter(i, pageCount)}
              onSaveAllChapters={() => saveAllChapters(pageCount)}
            />
            {savedCount === chapters.length && chapters.length > 0 && (
              <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-3 sm:p-5">
                <div className="flex items-center gap-3 mb-2">
                  <HiBookOpen className="w-5 h-5 text-cyan-400" />
                  <h4 className="text-sm font-semibold text-slate-200">Chapter View</h4>
                </div>
                <p className="text-xs text-slate-400 mb-3">
                  Convert all {chapters.length} chapters into individual documents. The original PDF will be removed.
                  Chapters will appear as a single textbook in the Documents page.
                </p>
                {convertError && (
                  <p className="text-xs text-red-400 mb-3">{convertError}</p>
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
            <HiBookOpen className="w-5 h-5 text-cyan-400" />
            <span className="text-sm font-medium text-slate-200 truncate">{loadedTextbook.name}</span>
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
                  onPageChange={setChapterLocalPage}
                  totalPages={chapterPageCount}
                />
              </div>
              {selectedChapterId && showAnalysis && (
                <ChapterAnalysisPanel chapterId={selectedChapterId} />
              )}
            </>
          ) : (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-300">
                {loadedTextbook.documents.length} chapter{loadedTextbook.documents.length !== 1 ? 's' : ''}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {loadedTextbook.documents.map((doc) => (
                  <Card
                    key={doc.id}
                    onClick={() => handleSelectChapterDocument(doc)}
                    className="hover:scale-[1.02] transition-transform cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📑</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-200 truncate">{doc.name}</p>
                        <p className="text-xs text-slate-500">
                          {doc.size > 0 ? `${(doc.size / 1024).toFixed(0)} KB` : ''}
                          {doc.parsedText ? ` · ${doc.parsedText.length.toLocaleString()} chars` : ''}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
