import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiPlus, HiX, HiTrash, HiDocument, HiExclamationCircle } from 'react-icons/hi';
import EmptyState from '../components/shared/EmptyState';
import Spinner from '../components/shared/Spinner';
import Badge from '../components/shared/Badge';
import ConfirmDialog from '../components/shared/ConfirmDialog';
import { usePracticeTests, usePracticeTestGeneration } from '../hooks/usePracticeTests';
import { useCourses } from '../hooks/useCourses';
import { useDocumentStore } from '../store/documentStore';
import { usePracticeTestStore } from '../store/practiceTestStore';

/**
 * Fallback question target when a test's `config.numQuestions` isn't set
 * (server default, see `server/routes/practiceTests.ts`).
 */
const DEFAULT_QUESTION_TARGET = 10;

/**
 * Generation stages that count as "actively generating" (vs. idle / done /
 * error). The card should show "Generating…" for any of these, not "Pending".
 */
const ACTIVE_GENERATION_STAGES = ['collecting', 'generating', 'synthesizing'] as const;

export default function PracticeTestsPage() {
  const navigate = useNavigate();
  const { tests, loading, error, refetch } = usePracticeTests();
  const { generationProgress } = usePracticeTestGeneration();
  const { courses, loadCourses } = useCourses();
  const documents = useDocumentStore((s) => s.documents);
  const createTest = usePracticeTestStore((s) => s.createTest);
  const deleteTest = usePracticeTestStore((s) => s.deleteTest);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceType, setSourceType] = useState<'course' | 'document'>('course');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [numQuestions, setNumQuestions] = useState(10);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['mcq', 'true_false', 'short_answer']);
  const [instructions, setInstructions] = useState('');
  const [creating, setCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const params = {
        title: title.trim() || 'Untitled Test',
        description: description.trim(),
        source:
          sourceType === 'course'
            ? { type: 'course' as const, ids: [selectedCourseId] }
            : { type: 'document' as const, ids: [selectedDocumentId] },
        config: {
          numQuestions,
          types: selectedTypes,
          instructions: instructions.trim() || undefined,
        },
        course_id: sourceType === 'course' ? selectedCourseId : undefined,
      };
      const test = await createTest(params);
      // Fire-and-forget: generation runs in the store and survives navigation
      void usePracticeTestStore.getState().generateTest(test.id);
      setShowCreateForm(false);
      setTitle('');
      setDescription('');
      setSelectedCourseId('');
      setSelectedDocumentId('');
      navigate(`/tests/${test.id}`);
    } catch (err) {
      console.error('Failed to create test:', err);
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
          <h1 style={{ fontSize: 32, margin: 'var(--space-1) 0 var(--space-2)' }}>Practice Tests</h1>
          <p style={{ fontSize: 15, opacity: 0.6, margin: 0 }}>
            Create and take AI-generated practice tests
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className={`btn whitespace-nowrap ${showCreateForm ? 'btn-secondary' : 'btn-primary'}`}
        >
          {showCreateForm ? <HiX className="w-4 h-4" /> : <HiPlus className="w-4 h-4" />}
          {showCreateForm ? 'Cancel' : 'New Test'}
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="card space-y-4" style={{ padding: 'var(--space-4)' }}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Test title (optional)"
            className="input"
            autoFocus
          />

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="input resize-none"
            rows={2}
          />

          {/* Question count */}
          <div>
            <label className="block text-sm mb-2" style={{ opacity: 0.75 }}>
              Number of questions: {numQuestions}
            </label>
            <input
              type="range"
              min="5"
              max="50"
              value={numQuestions}
              onChange={(e) => setNumQuestions(parseInt(e.target.value))}
              className="w-full"
              style={{ accentColor: 'var(--color-accent)' }}
            />
          </div>

          {/* Special instructions */}
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Special instructions (optional) — e.g. 'exam style', 'focus on chapter 3'"
            className="input resize-none"
            rows={2}
          />

          {/* Question types */}
          <div>
            <label className="block text-sm mb-2" style={{ opacity: 0.75 }}>Question types:</label>
            <div className="flex gap-2">
              {(['mcq', 'true_false', 'short_answer'] as const).map((type) => (
                <label key={type} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes(type)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedTypes([...selectedTypes, type]);
                      } else {
                        setSelectedTypes(selectedTypes.filter((t) => t !== type));
                      }
                    }}
                  />
                  <span className="text-sm" style={{ opacity: 0.75 }}>
                    {type === 'mcq'
                      ? 'Multiple Choice'
                      : type === 'true_false'
                        ? 'True/False'
                        : 'Short Answer'}
                  </span>
                </label>
              ))}
            </div>
          </div>

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

          <button
            onClick={handleCreate}
            disabled={!canCreate || selectedTypes.length === 0}
            className="btn btn-primary w-full"
          >
            {creating ? 'Creating…' : 'Create & Generate'}
          </button>
        </div>
      )}

      {/* List */}
      {loading && tests.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : tests.length === 0 && !error ? (
        <EmptyState
          icon={<HiDocument className="w-12 h-12" />}
          title="No tests yet"
          description="Create a practice test from a course or document to test your knowledge."
          action={{ label: 'Create Test', onClick: () => setShowCreateForm(true) }}
        />
      ) : (
        <div className="space-y-4">
          {/* Fetch error banner */}
          {error && (
            <div
              className="flex items-center justify-between gap-4 p-4"
              style={{
                background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-danger)',
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <HiExclamationCircle className="w-5 h-5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">Couldn't load practice tests</p>
                  <p className="text-sm truncate" style={{ opacity: 0.8 }}>{error}</p>
                </div>
              </div>
              <button onClick={() => void refetch()} className="btn btn-secondary shrink-0">
                Retry
              </button>
            </div>
          )}
          <div className="flex flex-col">
            {tests.map((test) => {
              const course = courses.find((c) => c.id === test.course_id);
              const sourceName = course?.name ?? 'Untitled';
              const prog = generationProgress[test.id];
              const questionTarget = test.config.numQuestions ?? DEFAULT_QUESTION_TARGET;
              const isGenerating =
                test.status === 'generating' ||
                (prog != null &&
                  ACTIVE_GENERATION_STAGES.includes(prog.stage as (typeof ACTIVE_GENERATION_STAGES)[number]));

              return (
                <div
                  key={test.id}
                  onClick={() => navigate(`/tests/${test.id}`)}
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
                      <span className="font-semibold">{test.title}</span>{' '}
                      <span style={{ opacity: 0.5, fontSize: 13 }}>{sourceName}</span>
                    </div>
                    {isGenerating && prog && (
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
                            width: `${Math.min(100, (prog.itemsGenerated / questionTarget) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {test.status === 'done' ? (
                    <Badge color="green">Ready</Badge>
                  ) : isGenerating ? (
                    <Badge color="teal">Generating…</Badge>
                  ) : test.status === 'error' ? (
                    <Badge color="red">Error</Badge>
                  ) : (
                    <Badge color="gray">Pending</Badge>
                  )}

                  {isGenerating && prog?.itemsGenerated ? (
                    <span
                      className="whitespace-nowrap"
                      style={{ fontSize: 12, color: 'var(--color-accent-700)' }}
                    >
                      {prog.itemsGenerated} questions
                    </span>
                  ) : (
                    <span className="whitespace-nowrap" style={{ fontSize: 12, opacity: 0.5 }}>
                      {new Date(test.updated_at).toLocaleDateString()}
                    </span>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(test.id);
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
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete test?"
        message={`Delete "${tests.find((t) => t.id === confirmDeleteId)?.title ?? 'this test'}"? This can't be undone.`}
        onConfirm={() => {
          if (confirmDeleteId) deleteTest(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
