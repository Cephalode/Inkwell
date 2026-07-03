import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiPlus, HiX, HiSparkles, HiTrash, HiBookOpen } from 'react-icons/hi';
import EmptyState from '../components/shared/EmptyState';
import Spinner from '../components/shared/Spinner';
import Badge from '../components/shared/Badge';
import { useFlashcards, useFlashcardGeneration } from '../hooks/useFlashcards';
import { useCourses } from '../hooks/useCourses';
import { useDocumentStore } from '../store/documentStore';
import { useFlashcardStore } from '../store/flashcardStore';

export default function FlashcardsPage() {
  const navigate = useNavigate();
  const { decks, loading } = useFlashcards();
  const { generationProgress } = useFlashcardGeneration();
  const { courses, loadCourses } = useCourses();
  const documents = useDocumentStore((s) => s.documents);
  const createDeck = useFlashcardStore((s) => s.createDeck);
  const deleteDeck = useFlashcardStore((s) => s.deleteDeck);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceType, setSourceType] = useState<'course' | 'document'>('course');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const params = {
        title: title.trim() || 'Untitled Deck',
        description: description.trim(),
        source:
          sourceType === 'course'
            ? { type: 'course' as const, ids: [selectedCourseId] }
            : { type: 'document' as const, ids: [selectedDocumentId] },
        course_id: sourceType === 'course' ? selectedCourseId : undefined,
      };
      const deck = await createDeck(params);
      // Fire-and-forget: generation runs in the store and survives navigation
      void useFlashcardStore.getState().generateDeck(deck.id);
      setShowCreateForm(false);
      setTitle('');
      setDescription('');
      setSelectedCourseId('');
      setSelectedDocumentId('');
      navigate(`/flashcards/${deck.id}`);
    } catch (err) {
      console.error('Failed to create deck:', err);
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
            <HiBookOpen className="w-6 h-6 text-amber-400" />
            Flashcard Decks
          </h1>
          <p className="text-slate-400">Create decks and practice with interactive flashcards</p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
        >
          {showCreateForm ? <HiX className="w-4 h-4" /> : <HiPlus className="w-4 h-4" />}
          {showCreateForm ? 'Cancel' : 'New Deck'}
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Deck title (optional)"
            className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 text-sm"
            autoFocus
          />

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 text-sm resize-none"
            rows={2}
          />

          {/* Source type toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setSourceType('course')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sourceType === 'course'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-700/50 text-slate-400 hover:text-slate-200'
              }`}
            >
              From Course
            </button>
            <button
              onClick={() => setSourceType('document')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sourceType === 'document'
                  ? 'bg-amber-600 text-white'
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
              className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500 text-sm"
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
              className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500 text-sm"
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
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {creating ? 'Creating…' : 'Create & Generate'}
          </button>
        </div>
      )}

      {/* List */}
      {loading && decks.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : decks.length === 0 ? (
        <EmptyState
          icon={<HiBookOpen className="w-12 h-12" />}
          title="No decks yet"
          description="Create a flashcard deck from a course or document to practice with AI-generated cards."
          action={{ label: 'Create Deck', onClick: () => setShowCreateForm(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {decks.map((deck) => {
            const course = courses.find((c) => c.id === deck.course_id);
            const sourceName = course?.name ?? 'Untitled';
            const prog = generationProgress[deck.id];
            const isGenerating = deck.status === 'generating' || prog?.stage === 'generating';

            return (
              <div
                key={deck.id}
                onClick={() => navigate(`/flashcards/${deck.id}`)}
                className="group relative bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 cursor-pointer hover:border-amber-600/50 hover:bg-slate-800/80 transition-all"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteDeck(deck.id);
                  }}
                  className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete"
                >
                  <HiTrash className="w-4 h-4" />
                </button>

                <div className="flex items-start gap-3 mb-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 shrink-0">
                    <HiSparkles className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="min-w-0 flex-1 pr-6">
                    <h3 className="text-sm font-semibold text-slate-200 truncate">
                      {deck.title}
                    </h3>
                    <p className="text-xs text-slate-500 truncate">{sourceName}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  {deck.status === 'done' ? (
                    <Badge color="green">Ready</Badge>
                  ) : isGenerating ? (
                    <Badge color="yellow">Generating…</Badge>
                  ) : deck.status === 'error' ? (
                    <Badge color="red">Error</Badge>
                  ) : (
                    <Badge color="gray">Pending</Badge>
                  )}
                  {isGenerating && prog?.cardsGenerated ? (
                    <span className="text-xs text-amber-400">{prog.cardsGenerated} cards</span>
                  ) : (
                    <span className="text-xs text-slate-500">
                      {new Date(deck.updated_at).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {isGenerating && prog && (
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-700/60 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-500 w-1/2" />
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
