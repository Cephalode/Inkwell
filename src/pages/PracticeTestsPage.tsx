import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiPlus, HiX, HiSparkles, HiTrash, HiDocument, HiExclamationCircle } from 'react-icons/hi';
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
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-1 flex items-center gap-2">
            <HiDocument className="w-6 h-6 text-teal-400" />
            Practice Tests
          </h1>
          <p className="text-slate-400">Create and take AI-generated practice tests</p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
        >
          {showCreateForm ? <HiX className="w-4 h-4" /> : <HiPlus className="w-4 h-4" />}
          {showCreateForm ? 'Cancel' : 'New Test'}
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Test title (optional)"
            className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500 text-sm"
            autoFocus
          />

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500 text-sm resize-none"
            rows={2}
          />

          {/* Question count */}
          <div>
            <label className="block text-sm text-slate-300 mb-2">
              Number of questions: {numQuestions}
            </label>
            <input
              type="range"
              min="5"
              max="50"
              value={numQuestions}
              onChange={(e) => setNumQuestions(parseInt(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Question types */}
          <div>
            <label className="block text-sm text-slate-300 mb-2">Question types:</label>
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
                    className="rounded"
                  />
                  <span className="text-sm text-slate-300">
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
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sourceType === 'course'
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-700/50 text-slate-400 hover:text-slate-200'
              }`}
            >
              From Course
            </button>
            <button
              onClick={() => setSourceType('document')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sourceType === 'document'
                  ? 'bg-teal-600 text-white'
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
              className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-teal-500 text-sm"
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
              className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-teal-500 text-sm"
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
            className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors w-full"
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
            <div className="bg-red-900/30 border border-red-700/50 text-red-300 rounded-lg p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <HiExclamationCircle className="w-5 h-5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">Couldn't load practice tests</p>
                  <p className="text-sm text-red-400/80 truncate">{error}</p>
                </div>
              </div>
              <button
                onClick={() => void refetch()}
                className="shrink-0 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-500 transition-colors"
              >
                Retry
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                className="group relative bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 cursor-pointer hover:border-teal-600/50 hover:bg-slate-800/80 transition-all"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDeleteId(test.id);
                  }}
                  className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete"
                >
                  <HiTrash className="w-4 h-4" />
                </button>

                <div className="flex items-start gap-3 mb-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-teal-500/10 border border-teal-500/20 shrink-0">
                    <HiSparkles className="w-4 h-4 text-teal-400" />
                  </div>
                  <div className="min-w-0 flex-1 pr-6">
                    <h3 className="text-sm font-semibold text-slate-200 truncate">{test.title}</h3>
                    <p className="text-xs text-slate-500 truncate">{sourceName}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
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
                    <span className="text-xs text-teal-400">
                      {prog.itemsGenerated} questions
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">
                      {new Date(test.updated_at).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {isGenerating && prog && (
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-700/60 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-teal-500 to-cyan-400 transition-all duration-500"
                      style={{
                        width: `${Math.min(100, (prog.itemsGenerated / questionTarget) * 100)}%`,
                      }}
                    />
                  </div>
                )}
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
