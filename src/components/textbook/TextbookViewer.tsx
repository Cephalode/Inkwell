import { useState, useEffect, useRef } from 'react';
import { HiChevronLeft, HiChevronRight, HiZoomIn, HiZoomOut } from 'react-icons/hi';
import Button from '../shared/Button';

interface TextbookViewerProps {
  file: File | Blob | null;
  currentPage: number;
  onPageChange: (page: number) => void;
  totalPages: number;
}

export default function TextbookViewer({ file, currentPage, onPageChange, totalPages }: TextbookViewerProps) {
  const [scale, setScale] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  return (
    <div className="flex flex-col items-center bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-hidden">
      <div className="flex items-center gap-3 p-3 border-b border-slate-700/50 w-full bg-slate-800/50">
        <Button size="sm" variant="ghost" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}>
          <HiChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm text-slate-300">Page {currentPage} of {totalPages}</span>
        <Button size="sm" variant="ghost" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages}>
          <HiChevronRight className="w-4 h-4" />
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => setScale(Math.max(0.5, scale - 0.25))}>
          <HiZoomOut className="w-4 h-4" />
        </Button>
        <span className="text-xs text-slate-400">{Math.round(scale * 100)}%</span>
        <Button size="sm" variant="ghost" onClick={() => setScale(Math.min(3, scale + 0.25))}>
          <HiZoomIn className="w-4 h-4" />
        </Button>
      </div>
      <div className="p-4 overflow-auto max-h-[600px] w-full flex justify-center">
        <div className="text-center text-slate-400 py-20">
          <p>📄 PDF viewer for page {currentPage}</p>
          <p className="text-sm mt-2">Select a page range below to start studying</p>
        </div>
      </div>
    </div>
  );
}
