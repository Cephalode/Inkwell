import Button from '../shared/Button';
import Badge from '../shared/Badge';
import Spinner from '../shared/Spinner';
import { HiDocumentText, HiChevronRight } from 'react-icons/hi';
import type { ChapterDocument } from '../../types/document';

interface ChapterSelectorProps {
  chapters: ChapterDocument[];
  isExtracting: boolean;
  error: string | null;
  onExtractChapters: () => void;
  onSelectChapter: (chapter: ChapterDocument) => void;
  selectedChapterId: string | null;
}

export default function ChapterSelector({
  chapters,
  isExtracting,
  error,
  onExtractChapters,
  onSelectChapter,
  selectedChapterId,
}: ChapterSelectorProps) {
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-3 sm:p-5">
      <h4 className="text-sm font-semibold text-slate-200 mb-4">Chapters</h4>

      {isExtracting ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <Spinner size="md" />
          <span className="text-sm text-slate-400">Analyzing chapters…</span>
        </div>
      ) : error ? (
        <div className="text-center py-6">
          <p className="text-sm text-red-400 mb-3">{error}</p>
          <Button onClick={onExtractChapters} variant="outline" size="sm">
            Retry
          </Button>
        </div>
      ) : chapters.length > 0 ? (
        <ul className="space-y-2 max-h-[400px] overflow-y-auto">
          {chapters.map((ch) => (
            <li key={ch.id}>
              <button
                onClick={() => onSelectChapter(ch)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                  selectedChapterId === ch.id
                    ? 'bg-cyan-600/20 border border-cyan-500/50 text-cyan-200'
                    : 'bg-slate-700/30 border border-transparent hover:bg-slate-700/60 text-slate-300 hover:text-slate-200'
                }`}
              >
                <HiDocumentText className="w-4 h-4 shrink-0 opacity-60" />
                <span className="flex-1 truncate">{ch.chapterTitle}</span>
                <Badge color="slate" className="shrink-0">
                  pp. {ch.startPage}–{ch.endPage}
                </Badge>
                <HiChevronRight className="w-4 h-4 shrink-0 opacity-40" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-center py-6">
          <p className="text-sm text-slate-500 mb-3">
            No chapters extracted yet. Automatically detect and split chapters from this PDF.
          </p>
          <Button onClick={onExtractChapters}>
            <HiDocumentText className="w-4 h-4" />
            Extract Chapters
          </Button>
        </div>
      )}
    </div>
  );
}
