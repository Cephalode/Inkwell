import { useState, useEffect, useRef } from 'react';
import { HiChevronLeft, HiChevronRight, HiZoomIn, HiZoomOut } from 'react-icons/hi';
import Button from '../shared/Button';
import * as pdfjsLib from 'pdfjs-dist';
import { renderPDFPageToCanvas } from '../../services/parsers/pdfParser';

import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface TextbookViewerProps {
  file: File | Blob | null;
  currentPage: number;
  onPageChange: (page: number) => void;
  totalPages: number;
  /** When set, the actual PDF page rendered = currentPage + pageOffset */
  pageOffset?: number;
}

export default function TextbookViewer({ file, currentPage, onPageChange, totalPages, pageOffset = 0 }: TextbookViewerProps) {
  const [scale, setScale] = useState(1);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped after each successful PDF load so the render effect re-runs once the doc is ready.
  const [pdfLoadCount, setPdfLoadCount] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderVersionRef = useRef(0);
  const cancelRenderRef = useRef<(() => void) | null>(null);
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const arrayBufferRef = useRef<ArrayBuffer | null>(null);

  // Load and cache PDF document from blob — reuse ArrayBuffer across remounts
  useEffect(() => {
    if (!file) {
      pdfRef.current = null;
      arrayBufferRef.current = null;
      return;
    }

    let cancelled = false;

    (async () => {
      // Reuse cached ArrayBuffer if we already have one for this blob
      if (!arrayBufferRef.current) {
        arrayBufferRef.current = await file.arrayBuffer();
      }

      if (cancelled) return;
      const pdf = await pdfjsLib.getDocument({ data: arrayBufferRef.current.slice(0) }).promise;
      if (!cancelled) {
        pdfRef.current = pdf;
        setPdfLoadCount((c) => c + 1);
      }
    })();

    return () => { cancelled = true; };
  }, [file]);

  // Render the current page to canvas whenever inputs change or PDF finishes loading.
  // All setState happens after the await so we don't trigger cascading renders.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !file) return;

    // Cancel any in-flight render before starting a new one
    cancelRenderRef.current?.();
    cancelRenderRef.current = null;

    const version = ++renderVersionRef.current;
    let cancelled = false;

    (async () => {
      const pdf = pdfRef.current;
      if (!pdf) return;

      try {
        const cancel = await renderPDFPageToCanvas(canvas, pdf, currentPage + pageOffset, scale);
        if (!cancelled && version === renderVersionRef.current) {
          cancelRenderRef.current = cancel;
          setIsRendering(false);
          setError(null);
        }
      } catch (err) {
        if (!cancelled && version === renderVersionRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to render PDF page');
          setIsRendering(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file, currentPage, scale, pageOffset, pdfLoadCount]);

  const handleZoomIn = () => setScale((s) => Math.min(3, s + 0.25));
  const handleZoomOut = () => setScale((s) => Math.max(0.5, s - 0.25));

  return (
    <div className="card flex flex-col items-center overflow-hidden overflow-x-auto">
      <div
        className="flex flex-wrap items-center gap-2 sm:gap-3 p-2 sm:p-3 w-full"
        style={{ borderBottom: '1px solid var(--color-divider)' }}
      >
        <Button size="sm" variant="ghost" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}>
          <HiChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm" style={{ opacity: 0.75 }}>Page {currentPage} of {totalPages}</span>
        <Button size="sm" variant="ghost" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages}>
          <HiChevronRight className="w-4 h-4" />
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={handleZoomOut} disabled={scale <= 0.5}>
          <HiZoomOut className="w-4 h-4" />
        </Button>
        <span className="text-xs" style={{ opacity: 0.6 }}>{Math.round(scale * 100)}%</span>
        <Button size="sm" variant="ghost" onClick={handleZoomIn} disabled={scale >= 3}>
          <HiZoomIn className="w-4 h-4" />
        </Button>
      </div>

      <div className="p-4 overflow-auto max-h-[600px] w-full flex justify-center items-center relative min-h-[200px]">
        {!file ? (
          <div className="text-center py-20" style={{ opacity: 0.6 }}>
            <p>📄 No PDF loaded</p>
            <p className="text-sm mt-2">Select a PDF to start viewing</p>
          </div>
        ) : error ? (
          <div className="text-center py-20" style={{ color: 'var(--color-danger)' }}>
            <p>⚠️ Failed to render page</p>
            <p className="text-sm mt-2">{error}</p>
          </div>
        ) : (
          <>
            {isRendering && (
              <div
                className="absolute inset-0 flex items-center justify-center z-10"
                style={{ background: 'color-mix(in srgb, var(--color-bg) 60%, transparent)' }}
              >
                <div className="flex flex-col items-center gap-2">
                  <svg className="animate-spin h-8 w-8" viewBox="0 0 24 24" style={{ color: 'var(--color-accent)' }}>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-sm" style={{ opacity: 0.75 }}>Rendering page…</span>
                </div>
              </div>
            )}
            <canvas
              ref={canvasRef}
              className="max-w-full h-auto"
              style={{ boxShadow: 'var(--shadow-md)', borderRadius: 'var(--radius-md)' }}
            />
          </>
        )}
      </div>
    </div>
  );
}
