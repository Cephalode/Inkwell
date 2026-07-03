import { useState } from 'react';
import { HiArrowLeft, HiDocumentText, HiX, HiPlus, HiChevronUp } from 'react-icons/hi';
import EmptyState from '../shared/EmptyState';
import { Course } from '../../types/course';
import { DocumentFile } from '../../types/document';

interface CourseDetailProps {
  course: Course;
  allDocuments: DocumentFile[];
  onBack: () => void;
  onRemoveDoc: (courseId: string, docId: string) => void;
  onAddDoc: (courseId: string, docId: string) => void;
}

export default function CourseDetail({ course, allDocuments, onBack, onRemoveDoc, onAddDoc }: CourseDetailProps) {
  const [showAddDocs, setShowAddDocs] = useState(false);

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

        {/* Course documents list */}
        {courseDocs.length === 0 ? (
          <EmptyState
            icon="📄"
            title="No documents in this course"
            description="Add documents to this course to organize your study materials"
          />
        ) : (
          <div className="space-y-2">
            {courseDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl hover:bg-slate-800/80 transition-colors"
              >
                <HiDocumentText className="w-5 h-5 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{doc.name}</p>
                  <p className="text-xs text-slate-500">{doc.type.toUpperCase()}</p>
                </div>
                <button
                  onClick={() => onRemoveDoc(course.id, doc.id)}
                  className="text-slate-500 hover:text-red-400 transition-colors p-1"
                  aria-label="Remove document"
                >
                  <HiX className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
