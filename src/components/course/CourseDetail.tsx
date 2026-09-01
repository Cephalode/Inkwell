import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HiArrowLeft, HiDocumentText, HiPlus, HiChevronUp, HiSparkles, HiPencilAlt } from 'react-icons/hi';
import { Course } from '../../types/course';
import { DocumentFile } from '../../types/document';

/** Relative "time ago" label from an epoch-ms timestamp. */
function relTime(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

/** Display type: first classification tag if present, else the file type. */
function docType(doc: DocumentFile): string {
  return (doc.tags[0] ?? doc.type).toUpperCase();
}

interface CourseDetailProps {
  course: Course;
  allDocuments: DocumentFile[];
  onBack: () => void;
  onRemoveDoc: (courseId: string, docId: string) => void;
  onAddDoc: (courseId: string, docId: string) => void;
}

export default function CourseDetail({ course, allDocuments, onBack, onAddDoc }: CourseDetailProps) {
  const [showAddDocs, setShowAddDocs] = useState(false);
  const navigate = useNavigate();

  const courseDocs = allDocuments.filter((d) => course.documentIds.includes(d.id));
  const availableDocs = allDocuments.filter((d) => !course.documentIds.includes(d.id));

  const colorStyle = course.color || '#06b6d4';

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-400 hover:text-cyan-400 transition-colors text-sm"
        >
          <HiArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>

      {/* Course info */}
      <div className="flex items-start gap-3 sm:gap-4">
        <div
          className="w-2 sm:w-3 h-8 sm:h-10 rounded-full shrink-0"
          style={{ backgroundColor: colorStyle }}
        />
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">{course.name}</h1>
          {course.description && (
            <p className="text-slate-400 mt-1">{course.description}</p>
          )}
          <p className="text-xs text-slate-500 mt-2">
            Created {new Date(course.createdAt).toLocaleDateString()} · Updated {new Date(course.updatedAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Study actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/flashcards"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 rounded-lg text-xs font-medium transition-colors border border-cyan-500/30"
        >
          <HiSparkles className="w-3.5 h-3.5" />
          Flashcards
        </Link>
        <Link
          to={`/notes?course=${course.id}`}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 rounded-lg text-xs font-medium transition-colors border border-cyan-500/30"
        >
          <HiPencilAlt className="w-3.5 h-3.5" />
          Notes
        </Link>
      </div>

      {/* Documents section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-200">
            Documents ({courseDocs.length})
          </h2>
          {availableDocs.length > 0 && (
            <button
              onClick={() => setShowAddDocs(!showAddDocs)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 rounded-lg text-xs font-medium transition-colors border border-cyan-500/30"
            >
              {showAddDocs ? <HiChevronUp className="w-3.5 h-3.5" /> : <HiPlus className="w-3.5 h-3.5" />}
              {showAddDocs ? 'Hide' : 'Add Documents'}
            </button>
          )}
        </div>

        {/* Add documents dropdown */}
        {showAddDocs && availableDocs.length > 0 && (
          <div className="mb-4 bg-slate-900/50 border border-slate-700/50 rounded-xl p-3 max-h-64 overflow-y-auto">
            <p className="text-xs text-slate-500 mb-2 px-1">Click a document to add it to this course</p>
            <div className="space-y-1">
              {availableDocs.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => onAddDoc(course.id, doc.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                >
                  <HiDocumentText className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="truncate">{doc.name}</span>
                  <HiPlus className="w-3.5 h-3.5 text-cyan-500 ml-auto shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Course materials table */}
        {courseDocs.length === 0 ? (
          <Link
            to="/documents"
            className="flex flex-col items-center justify-center gap-2 py-10 border-2 border-dashed border-slate-700 rounded-xl text-slate-500 hover:border-cyan-500/50 hover:text-cyan-400 transition-colors"
          >
            <HiPlus className="w-6 h-6" />
            <span className="text-sm font-medium">Add materials</span>
          </Link>
        ) : (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_5rem_5rem_5.5rem] gap-3 px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider border-b border-slate-700/50 bg-slate-800/30">
              <div>Name</div>
              <div>Type</div>
              <div className="text-right">Coverage</div>
              <div className="text-right">Updated</div>
            </div>
            {/* Rows */}
            {courseDocs.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => navigate(`/documents/${doc.id}`)}
                className="w-full grid grid-cols-[1fr_5rem_5rem_5.5rem] gap-3 items-center px-4 py-3 text-left border-b border-slate-700/30 last:border-b-0 hover:bg-slate-700/40 transition-colors group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <HiDocumentText className="w-4 h-4 text-slate-400 shrink-0 group-hover:text-cyan-300 transition-colors" />
                  <p className="text-sm font-medium text-slate-200 truncate group-hover:text-cyan-300 transition-colors">{doc.name}</p>
                </div>
                <span className="text-xs text-slate-500 truncate">{docType(doc)}</span>
                <span className="text-right text-xs text-slate-500 tabular-nums">
                  {doc.parsedPages && doc.parsedPages.length > 0 ? `${doc.parsedPages.length} pp` : '—'}
                </span>
                <span className="text-right text-xs text-slate-500 tabular-nums">{relTime(doc.updatedAt)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
