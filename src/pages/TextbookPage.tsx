import { useState, useEffect } from 'react';
import TextbookViewer from '../components/textbook/TextbookViewer';
import ChapterSelector from '../components/textbook/ChapterSelector';
import ChapterSubpage from '../components/textbook/ChapterSubpage';
import TextbookChat from '../components/textbook/TextbookChat';
import Card from '../components/shared/Card';
import Button from '../components/shared/Button';
import EmptyState from '../components/shared/EmptyState';
import { useTextbook } from '../hooks/useTextbook';
import { useChapters } from '../hooks/useChapters';
import { useDocumentStore } from '../store/documentStore';
import { SUPPORTED_FILE_TYPES } from '../utils/constants';
import type { ChapterDocument } from '../types/document';

export default function TextbookPage() {
  const { documents, currentDocument, setCurrentDocument } = useDocumentStore();
  const pdfs = documents.filter((d) => d.type === 'pdf');
  const { pageCount, startPage, endPage, isLoading, loadPDF, selectPageRange, askQuestion, setStartPage, setEndPage } = useTextbook();
  const { chapters, isExtracting, error: chapterError, extractChapters, loadChapters } = useChapters(currentDocument);
  const [pageLoaded, setPageLoaded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedChapter, setSelectedChapter] = useState<ChapterDocument | null>(null);

  const handleSelectPDF = async (doc: any) => {
    setCurrentDocument(doc);
    setSelectedChapter(null);
    if (doc.rawBlob) {
      const count = await loadPDF(doc.rawBlob);
      setPageLoaded(true);
    }
  };

  const handleConfirmRange = async () => {
    if (currentDocument?.rawBlob) {
      await selectPageRange(currentDocument.rawBlob, startPage, endPage);
    }
  };

  const handleSelectChapter = (chapter: ChapterDocument) => {
    setSelectedChapter(chapter);
  };

  const handleBackFromChapter = () => {
    setSelectedChapter(null);
  };

  // Reload chapters when the document changes
  useEffect(() => {
    if (currentDocument) {
      loadChapters();
    }
  }, [currentDocument, loadChapters]);

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
        <ChapterSubpage chapter={selectedChapter} onBack={handleBackFromChapter} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div className="space-y-4">
            <TextbookViewer file={currentDocument.rawBlob || null} currentPage={currentPage} onPageChange={setCurrentPage} totalPages={pageCount} />
            <ChapterSelector
              chapters={chapters}
              isExtracting={isExtracting}
              error={chapterError}
              onExtractChapters={extractChapters}
              onSelectChapter={handleSelectChapter}
              selectedChapterId={selectedChapter?.id ?? null}
            />
          </div>
          <TextbookChat onAsk={askQuestion} startPage={startPage} endPage={endPage} isLoading={isLoading} />
        </div>
      )}
    </div>
  );
}
