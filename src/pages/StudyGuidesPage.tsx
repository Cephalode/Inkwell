import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiPlus, HiX, HiSparkles, HiTrash, HiAcademicCap } from 'react-icons/hi';
import EmptyState from '../components/shared/EmptyState';
import Spinner from '../components/shared/Spinner';
import Badge from '../components/shared/Badge';
import { useStudyGuides } from '../hooks/useStudyGuides';
import { useCourses } from '../hooks/useCourses';
import { useDocumentStore } from '../store/documentStore';
import { useStudyGuideStore } from '../store/studyGuideStore';
import type { StudyGuideStatus } from '../types/studyGuide';

export default function StudyGuidesPage() {
  const navigate = useNavigate();
  const { guides, isLoading, loadGuides, createGuide, deleteGuide } = useStudyGuides();
  const { courses, loadCourses } = useCourses();
  const documents = useDocumentStore((s) => s.documents);
  const generationProgress = useStudyGuideStore((s) => s.generationProgress);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState<'course' | 'document'>('course');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadGuides();
    loadCourses();
  }, [loadGuides, loadCourses]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const params =
        sourceType === 'course'
          ? { title: title.trim() || undefined, courseId: selectedCourseId }
          : { title: title.trim() || undefined, documentId: selectedDocumentId };
      const guide = await createGuide(params);
      setShowCreateForm(false);
      setTitle('');
      setSelectedCourseId('');
      setSelectedDocumentId('');
      navigate(`/study-guides/${guide.id}`);
    } catch (err) {
      console.error('Failed to create study guide:', err);
    } finally {
      setCreating(false);
    }
  };

  const canCreate =
    !creating && (sourceType === 'course' ? !!selectedCourseId : !!selectedDocumentId);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-1 flex items-center gap-2">
            <HiAcademicCap className="w-6 h-6 text-cyan-400" />
            Study Guides
          </h1>
          <p className="text-slate-400">AI-generated guides synthesized from your course materials</p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
        >
          {showCreateForm ? <HiX className="w-4 h-4" /> : <HiPlus className="w-4 h-4" />}
          {showCreateForm ? 'Cancel' : 'New Guide'}
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4">
          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional — auto-generated from source)"
            className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
            autoFocus
          />

          {/* Source type toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setSourceType('course')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sourceType === 'course'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-700/50 text-slate-400 hover:text-slate-200'
              }`}
            >
              From Course
            </button>
            <button
              onClick={() => setSourceType('document')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sourceType === 'document'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-700/50 text-slate-400 hover:text-slate-200'
              }`}
            >
              From Document
            </button>
          </div>

          {/* Source picker */}
          {sourceType === 'course' ? (
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500 text-sm"
            >
              <option value="">Select a course…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.documentIds.length} docs)
                </option>
              ))}
            </select>
          ) : (
            <select
              value={selectedDocumentId}
              onChange={(e) => setSelectedDocumentId(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500 text-sm"
            >
              <option value="">Select a document…</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {creating ? 'Creating…' : 'Create & Generate'}
          </button>
        </div>
      )}

      {/* List */}
      {isLoading && guides.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : guides.length === 0 ? (
        <EmptyState
          icon={<HiAcademicCap className="w-12 h-12" />}
          title="No study guides yet"
          description="Create a study guide from a course or document to get an AI-synthesized overview, concept roadmap, and suggested study order."
          action={{ label: 'Create Study Guide', onClick: () => setShowCreateForm(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {guides.map((guide) => {
            const course = courses.find((c) => c.id === guide.courseId);
            const doc = documents.find((d) => d.id === guide.documentId);
            const sourceName = course?.name ?? doc?.name ?? 'Unknown source';
            const prog = generationProgress[guide.id];
            const isGenerating =
              guide.status === 'generating' ||
              prog?.status === 'collecting' ||
              prog?.status === 'analyzing' ||
              prog?.status === 'synthesizing';

            return (
              <div
                key={guide.id}
                onClick={() => navigate(`/study-guides/${guide.id}`)}
                className="group relative bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 cursor-pointer hover:border-cyan-600/50 hover:bg-slate-800/80 transition-all"
              >
                {/* Delete button (stops click propagation) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteGuide(guide.id);
                  }}
                  className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete"
                >
                  <HiTrash className="w-4 h-4" />
                </button>

                <div className="flex items-start gap-3 mb-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 shrink-0">
                    <HiSparkles className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="min-w-0 flex-1 pr-6">
                    <h3 className="text-sm font-semibold text-slate-200 truncate">{guide.title}</h3>
                    <p className="text-xs text-slate-500 truncate">{sourceName}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <GuideStatusBadge status={guide.status} isGenerating={isGenerating} />
                  {isGenerating && prog ? (
                    <span className="text-xs text-cyan-400">
                      {prog.current}/{prog.total}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">
                      {new Date(guide.updatedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {/* Progress bar during generation */}
                {isGenerating && prog && prog.total > 0 && (
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-700/60 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-teal-400 transition-all duration-500"
                      style={{ width: `${Math.round((prog.current / prog.total) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function GuideStatusBadge({
  status,
  isGenerating,
}: {
  status: StudyGuideStatus;
  isGenerating: boolean;
}) {
  if (isGenerating) return <Badge color="cyan">Generating…</Badge>;
  if (status === 'done') return <Badge color="green">Ready</Badge>;
  if (status === 'error') return <Badge color="red">Error</Badge>;
  return <Badge color="gray">Pending</Badge>;
}
