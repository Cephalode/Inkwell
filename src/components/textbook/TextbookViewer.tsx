import { useState, useEffect, useRef, useCallback } from 'react';
import { HiChevronLeft, HiChevronRight, HiZoomIn, HiZoomOut } from 'react-icons/hi';
import Button from '../shared/Button';
import { renderPDFPageToCanvas } from '../../services/parsers/pdfParser';

interface TextbookViewerProps {
  file: File | Blob | null;
  currentPage: number;
  onPageChange: (page: number) => void;
  totalPages: number;
}

export default function TextbookViewer({ file, currentPage, onPageChange, totalPages }: TextbookViewerProps) {
  const [scale, setScale] = useState(1);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderVersionRef = useRef(0);

  const renderPage = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !file) return;

    // Increment version to detect stale renders
    const version = ++renderVersionRef.current;
    setIsRendering(true);
    setError(null);

    try {
      await renderPDFPageToCanvas(canvas, file, currentPage, scale);

      // Only update state if this is still the latest render
      if (version === renderVersionRef.current) {
        setIsRendering(false);
      }
    } catch (err) {
      if (version === renderVersionRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to render PDF page');
        setIsRendering(false);
      }
    }
  }, [file, currentPage, scale]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  // Cleanup: mark render as stale on unmount
  useEffect(() => {
    return () => {
      renderVersionRef.current++;
    };
  }, []);

  const handleZoomIn = () => setScale((s) => Math.min(3, s + 0.25));
  const handleZoomOut = () => setScale((s) => Math.max(0.5, s - 0.25));

  return (
    <div className="flex flex-col items-center bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-hidden overflow-x-auto">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 p-2 sm:p-3 border-b border-slate-700/50 w-full bg-slate-800/50">
        <Button size="sm" variant="ghost" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}>
          <HiChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm text-slate-300">Page {currentPage} of {totalPages}</span>
        <Button size="sm" variant="ghost" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages}>
          <HiChevronRight className="w-4 h-4" />
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={handleZoomOut} disabled={scale <= 0.5}>
          <HiZoomOut className="w-4 h-4" />
        </Button>
        <span className="text-xs text-slate-400">{Math.round(scale * 100)}%</span>
        <Button size="sm" variant="ghost" onClick={handleZoomIn} disabled={scale >= 3}>
          <HiZoomIn className="w-4 h-4" />
        </Button>
      </div>

      {/* Canvas area */}
      <div className="p-4 overflow-auto max-h-[600px] w-full flex justify-center items-center relative min-h-[200px]">
        {!file ? (
          <div className="text-center text-slate-400 py-20">
            <p>📄 No PDF loaded</p>
            <p className="text-sm mt-2">Select a PDF to start viewing</p>
          </div>
        ) : error ? (
          <div className="text-center text-red-400 py-20">
            <p>⚠️ Failed to render page</p>
            <p className="text-sm mt-2 text-red-300">{error}</p>
          </div>
        ) : (
          <>
            {isRendering && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 z-10">
                <div className="flex flex-col items-center gap-2">
                  <svg className="animate-spin h-8 w-8 text-cyan-400" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-sm text-slate-300">Rendering page…</span>
                </div>
              </div>
            )}
            <canvas
              ref={canvasRef}
              className="max-w-full h-auto shadow-lg rounded"
            />
          </>
        )}
      </div>
    </div>
  );
}
