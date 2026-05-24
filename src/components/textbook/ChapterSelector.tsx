import { useState } from 'react';
import Button from '../shared/Button';
import { HiSearch } from 'react-icons/hi';

interface ChapterSelectorProps {
  totalPages: number;
  onStartPageChange: (page: number) => void;
  onEndPageChange: (page: number) => void;
  startPage: number;
  endPage: number;
  onConfirm: () => void;
}

export default function ChapterSelector({ totalPages, startPage, endPage, onStartPageChange, onEndPageChange, onConfirm }: ChapterSelectorProps) {
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
      <h4 className="text-sm font-semibold text-slate-200 mb-4">Select Page Range</h4>
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <label className="block text-xs text-slate-400 mb-1">Start Page</label>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={startPage}
            onChange={(e) => onStartPageChange(Math.max(1, Number(e.target.value)))}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm"
          />
        </div>
        <div className="text-slate-500 mt-5">—</div>
        <div className="flex-1">
          <label className="block text-xs text-slate-400 mb-1">End Page</label>
          <input
            type="number"
            min={startPage}
            max={totalPages}
            value={endPage}
            onChange={(e) => onEndPageChange(Math.min(totalPages, Number(e.target.value)))}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm"
          />
        </div>
        <div className="mt-5">
          <Button onClick={onConfirm}>
            <HiSearch className="w-4 h-4" />
            Load Pages
          </Button>
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-3">
        {endPage - startPage + 1} pages selected. Only this range will be used for Q&A.
      </p>
    </div>
  );
}
