import { useState, useEffect } from 'react';
import TextbookViewer from '../components/textbook/TextbookViewer';
import ChapterSelector from '../components/textbook/ChapterSelector';
import Card from '../components/shared/Card';
import Button from '../components/shared/Button';
import EmptyState from '../components/shared/EmptyState';
import { useTextbook } from '../hooks/useTextbook';
import { useChapters } from '../hooks/useChapters';
import { useDocumentStore } from '../store/documentStore';
import { downloadDocumentFile } from '../services/api/client';
import type { Chapter } from '../types/document';

export default function TextbookPage() {
  const { documents, currentDocument, setCurrentDocument } = useDocumentStore();
  const pdfs = documents.filter((d) => d.type === 'pdf');
  const { pageCount, startPage, endPage, loadPDF, selectPageRange, setStartPage, setEndPage } = useTextbook();
  const { chapters, isExtracting, isSaving, savingIndex, savedCount, savedChapters, error: chapterError, extractChapters, clearChapters, initChapters, saveSingleChapter, saveAllChapters } = useChapters(currentDocument);
  const [pageLoaded, setPageLoaded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [chapterLocalPage, setChapterLocalPage] = useState(1);

  const handleSelectPDF = async (doc: any) => {
    setCurrentDocument(doc);
    setSelectedChapter(null);
    let blob = doc.rawBlob;
    if (!blob) {
      blob = await downloadDocumentFile(doc.id);
      doc.rawBlob = blob;
    }
    await loadPDF(blob);
    setPageLoaded(true);
  };

  const handleSwitchDocument = () => {
    setCurrentDocument(null);
    setSelectedChapter(null);
    setPageLoaded(false);
  };

  const handleSelectChapter = (ch: Chapter) => {
    setSelectedChapter(ch);
    setChapterLocalPage(1);
    setStartPage(ch.page);
    const idx = chapters.findIndex((c) => c.title === ch.title && c.page === ch.page);
    const endPageNum = idx + 1 < chapters.length ? chapters[idx + 1].page - 1 : pageCount;
    setEndPage(endPageNum);
    if (currentDocument?.rawBlob) {
      selectPageRange(currentDocument.rawBlob, ch.page, endPageNum);
    }
  };

  const handleCloseChapter = () => {
    setSelectedChapter(null);
  };

  // Load cached chapter markers when document changes
  useEffect(() => {
    if (currentDocument) {
      initChapters();
    }
  }, [currentDocument, initChapters]);

  if (pdfs.length === 0) {
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

      {!currentDocument ? (
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
      ) : selectedChapter ? (
        /* ── Chapter sub-page ─────────────────────────────────────────────── */
        <>
          <div className="flex items-center gap-3">
            <Button onClick={handleCloseChapter} variant="secondary">← Back to textbook</Button>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm text-slate-400 truncate">{currentDocument.name}</span>
              <span className="text-slate-600">/</span>
              <span className="text-sm font-medium text-cyan-300 truncate">{selectedChapter.title}</span>
            </div>
          </div>
          <div>
            <TextbookViewer
              file={currentDocument.rawBlob || null}
              currentPage={chapterLocalPage}
              onPageChange={setChapterLocalPage}
              totalPages={endPage - selectedChapter.page + 1}
              pageOffset={selectedChapter.page - 1}
            />
          </div>
        </>
      ) : (
        /* ── Full textbook view ────────────────────────────────────────────── */
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
          </div>
        </>
      )}
    </div>
  );
}
