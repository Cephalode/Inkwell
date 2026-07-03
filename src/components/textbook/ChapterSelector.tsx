import Button from '../shared/Button';
import Badge from '../shared/Badge';
import Spinner from '../shared/Spinner';
import { HiDocumentText, HiDownload, HiCheck } from 'react-icons/hi';
import type { Chapter } from '../../types/document';

interface ChapterSelectorProps {
  chapters: Chapter[];
  totalPages: number;
  isExtracting: boolean;
  isSaving: boolean;
  savingIndex: number;
  savedCount: number;
  savedChapters: Set<number>;
  error: string | null;
  onExtractChapters: () => void;
  onClearChapters: () => void;
  onSelectChapter: (chapter: Chapter) => void;
  onSaveChapter: (index: number) => void;
  onSaveAllChapters: () => void;
}

export default function ChapterSelector({
  chapters,
  totalPages,
  isExtracting,
  isSaving,
  savingIndex,
  savedCount,
  savedChapters,
  error,
  onExtractChapters,
  onClearChapters,
  onSelectChapter,
  onSaveChapter,
  onSaveAllChapters,
}: ChapterSelectorProps) {
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-3 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-slate-200">Chapters</h4>
        {chapters.length > 0 && (
          <button
            onClick={onClearChapters}
            className="text-xs text-slate-500 hover:text-red-400 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {isExtracting ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <Spinner size="md" />
          <span className="text-sm text-slate-400">Analyzing chapters…</span>
        </div>
      ) : error ? (
        <div className="text-center py-6">
          <p className="text-sm text-red-400 mb-3">{error}</p>
          <Button onClick={onExtractChapters} variant="secondary" size="sm">
            Retry
          </Button>
        </div>
      ) : chapters.length > 0 ? (
        <>
          <ul className="space-y-1 max-h-[400px] overflow-y-auto">
            {chapters.map((ch, i) => {
              const endPage = i + 1 < chapters.length ? chapters[i + 1].page - 1 : totalPages;
              const isSavingThis = savingIndex === i;
              const isSaved = savedChapters.has(i);
              return (
                <li key={i}>
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors bg-slate-700/30 border border-transparent hover:bg-slate-700/60 text-slate-300 hover:text-slate-200"
                  >
                    <button
                      onClick={() => onSelectChapter(ch)}
                      className="flex-1 flex items-center gap-3 text-left min-w-0"
                    >
                      <HiDocumentText className="w-4 h-4 shrink-0 opacity-60" />
                      <span className="truncate">{ch.title}</span>
                      <Badge color="gray" className="shrink-0">
                        pp. {ch.page}–{endPage}
                      </Badge>
                    </button>
                    <button
                      onClick={() => onSaveChapter(i)}
                      disabled={isSaving}
                      title={isSaved ? 'Saved' : 'Save chapter'}
                      className="shrink-0 p-1 rounded hover:bg-slate-600/50 transition-colors disabled:opacity-50"
                    >
                      {isSavingThis ? (
                        <Spinner size="sm" />
                      ) : isSaved ? (
                        <HiCheck className="w-4 h-4 text-green-400" />
                      ) : (
                        <HiDownload className="w-4 h-4 opacity-50 hover:opacity-100" />
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 pt-3 border-t border-slate-700/50">
            <Button
              onClick={onSaveAllChapters}
              disabled={isSaving || savedCount === chapters.length}
              variant="secondary"
              size="sm"
              className="w-full"
            >
              {savedCount === chapters.length ? (
                <>
                  <HiCheck className="w-4 h-4 text-green-400" />
                  All {chapters.length} chapters saved
                </>
              ) : isSaving ? (
                <>
                  <Spinner size="sm" />
                  Saving {savingIndex + 1}/{chapters.length}…
                </>
              ) : savedCount > 0 ? (
                <>
                  <HiDownload className="w-4 h-4" />
                  Save remaining ({chapters.length - savedCount})
                </>
              ) : (
                <>
                  <HiDownload className="w-4 h-4" />
                  Save all {chapters.length} chapters
                </>
              )}
            </Button>
          </div>
        </>
      ) : (
        <div className="text-center py-6">
          <p className="text-sm text-slate-500 mb-3">
            Detect chapter headings and page numbers from this PDF.
          </p>
          <Button onClick={onExtractChapters}>
            <HiDocumentText className="w-4 h-4" />
            Detect Chapters
          </Button>
        </div>
      )}
    </div>
  );
}
