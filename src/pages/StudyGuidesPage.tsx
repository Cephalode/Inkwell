import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiPlus, HiX, HiTrash, HiAcademicCap } from 'react-icons/hi';
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
    <div className="space-y-4 sm:space-y-6" style={{ maxWidth: 860 }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="card-kicker" style={{ fontSize: 13 }}>Study tools</div>
          <h1 style={{ fontSize: 32, margin: 'var(--space-1) 0 var(--space-2)' }}>Study Guides</h1>
          <p style={{ fontSize: 15, opacity: 0.6, margin: 0 }}>
            AI-generated guides synthesized from your course materials
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className={`btn whitespace-nowrap ${showCreateForm ? 'btn-secondary' : 'btn-primary'}`}
        >
          {showCreateForm ? <HiX className="w-4 h-4" /> : <HiPlus className="w-4 h-4" />}
          {showCreateForm ? 'Cancel' : 'New Guide'}
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="card space-y-4" style={{ padding: 'var(--space-4)' }}>
          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional — auto-generated from source)"
            className="input"
            autoFocus
          />

          {/* Source type toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setSourceType('course')}
              className={`btn ${sourceType === 'course' ? 'btn-primary' : 'btn-secondary'}`}
            >
              From Course
            </button>
            <button
              onClick={() => setSourceType('document')}
              className={`btn ${sourceType === 'document' ? 'btn-primary' : 'btn-secondary'}`}
            >
              From Document
            </button>
          </div>

          {/* Source picker */}
          {sourceType === 'course' ? (
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="input"
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
              className="input"
            >
              <option value="">Select a document…</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}

          <button onClick={handleCreate} disabled={!canCreate} className="btn btn-primary">
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
        <div className="flex flex-col">
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
                className="group grid cursor-pointer items-center"
                style={{
                  gridTemplateColumns: '1fr auto auto auto',
                  gap: 'var(--space-4)',
                  padding: '12px 0',
                  borderTop: '1px solid var(--color-neutral-300)',
                }}
              >
                <div className="min-w-0">
                  <div className="min-w-0" style={{ fontSize: 15 }}>
                    <span className="font-semibold">{guide.title}</span>{' '}
                    <span style={{ opacity: 0.5, fontSize: 13 }}>{sourceName}</span>
                  </div>
                  {/* Progress bar during generation */}
                  {isGenerating && prog && prog.total > 0 && (
                    <div
                      className="mt-2 h-1 w-full overflow-hidden"
                      style={{
                        background: 'var(--color-neutral-300)',
                        borderRadius: 'var(--radius-sm)',
                        maxWidth: 240,
                      }}
                    >
                      <div
                        className="h-full transition-all duration-500"
                        style={{
                          background: 'var(--color-accent)',
                          width: `${Math.round((prog.current / prog.total) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                </div>

                <GuideStatusBadge status={guide.status} isGenerating={isGenerating} />

                {isGenerating && prog ? (
                  <span
                    className="whitespace-nowrap"
                    style={{ fontSize: 12, color: 'var(--color-accent-700)' }}
                  >
                    {prog.current}/{prog.total}
                  </span>
                ) : (
                  <span className="whitespace-nowrap" style={{ fontSize: 12, opacity: 0.5 }}>
                    {new Date(guide.updatedAt).toLocaleDateString()}
                  </span>
                )}

                {/* Delete button (stops click propagation) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteGuide(guide.id);
                  }}
                  className="p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--color-danger)', borderRadius: 'var(--radius-md)' }}
                  title="Delete"
                >
                  <HiTrash className="w-4 h-4" />
                </button>
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
