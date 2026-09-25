import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiPlus, HiX, HiTrash, HiBookOpen, HiExclamationCircle } from 'react-icons/hi';
import EmptyState from '../components/shared/EmptyState';
import Spinner from '../components/shared/Spinner';
import Badge from '../components/shared/Badge';
import ConfirmDialog from '../components/shared/ConfirmDialog';
import { useFlashcards, useFlashcardGeneration } from '../hooks/useFlashcards';
import { useCourses } from '../hooks/useCourses';
import { useDocumentStore } from '../store/documentStore';
import { useFlashcardStore } from '../store/flashcardStore';

/**
 * Server caps flashcard generation at 30 cards per deck
 * (see `server/routes/flashcards.ts` → `maxCards`). Used to compute the
 * progress-bar width from `itemsGenerated`.
 */
const FLASHCARD_TARGET = 30;

/**
 * Generation stages that count as "actively generating" (vs. idle / done /
 * error). The card should show "Generating…" for any of these, not "Pending".
 */
const ACTIVE_GENERATION_STAGES = ['collecting', 'generating', 'synthesizing'] as const;

export default function FlashcardsPage() {
  const navigate = useNavigate();
  const { decks, loading, error, refetch } = useFlashcards();
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
  const [cardCount, setCardCount] = useState(30);
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
        title: title.trim() || 'Untitled Deck',
        description: description.trim(),
        source:
          sourceType === 'course'
            ? { type: 'course' as const, ids: [selectedCourseId] }
            : { type: 'document' as const, ids: [selectedDocumentId] },
        course_id: sourceType === 'course' ? selectedCourseId : undefined,
        config: { count: cardCount, instructions: instructions.trim() || undefined },
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
    <div className="space-y-4 sm:space-y-6" style={{ maxWidth: 860 }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="card-kicker" style={{ fontSize: 13 }}>Study tools</div>
          <h1 style={{ fontSize: 32, margin: 'var(--space-1) 0 var(--space-2)' }}>Flashcards</h1>
          <p style={{ fontSize: 15, opacity: 0.6, margin: 0 }}>
            Create decks and practice with interactive flashcards
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className={`btn whitespace-nowrap ${showCreateForm ? 'btn-secondary' : 'btn-primary'}`}
        >
          {showCreateForm ? <HiX className="w-4 h-4" /> : <HiPlus className="w-4 h-4" />}
          {showCreateForm ? 'Cancel' : 'New Deck'}
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="card space-y-4" style={{ padding: 'var(--space-4)' }}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Deck title (optional)"
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

          {/* Count presets */}
          <div>
            <label className="block text-sm mb-2" style={{ opacity: 0.75 }}>Number of cards:</label>
            <div className="flex gap-2">
              {[10, 20, 30, 50].map((n) => (
                <button
                  key={n}
                  onClick={() => setCardCount(n)}
                  className={`btn ${cardCount === n ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Special instructions */}
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Special instructions (optional) — e.g. 'focus on definitions', 'beginner level'"
            className="input resize-none"
            rows={2}
          />

          <button onClick={handleCreate} disabled={!canCreate} className="btn btn-primary">
            {creating ? 'Creating…' : 'Create & Generate'}
          </button>
        </div>
      )}

      {/* List */}
      {loading && decks.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : decks.length === 0 && !error ? (
        <EmptyState
          icon={<HiBookOpen className="w-12 h-12" />}
          title="No decks yet"
          description="Create a flashcard deck from a course or document to practice with AI-generated cards."
          action={{ label: 'Create Deck', onClick: () => setShowCreateForm(true) }}
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
                  <p className="font-medium">Couldn't load flashcard decks</p>
                  <p className="text-sm truncate" style={{ opacity: 0.8 }}>{error}</p>
                </div>
              </div>
              <button onClick={() => void refetch()} className="btn btn-secondary shrink-0">
                Retry
              </button>
            </div>
          )}
          <div className="flex flex-col">
            {decks.map((deck) => {
              const course = courses.find((c) => c.id === deck.course_id);
              const sourceName = course?.name ?? 'Untitled';
              const prog = generationProgress[deck.id];
              const isGenerating =
                deck.status === 'generating' ||
                (prog != null &&
                  ACTIVE_GENERATION_STAGES.includes(prog.stage as (typeof ACTIVE_GENERATION_STAGES)[number]));

              return (
                <div
                  key={deck.id}
                  onClick={() => navigate(`/flashcards/${deck.id}`)}
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
                      <span className="font-semibold">{deck.title}</span>{' '}
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
                            width: `${Math.min(100, (prog.itemsGenerated / (deck.config?.count || FLASHCARD_TARGET)) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {deck.status === 'done' ? (
                    <Badge color="green">Ready</Badge>
                  ) : isGenerating ? (
                    <Badge color="yellow">Generating…</Badge>
                  ) : deck.status === 'error' ? (
                    <Badge color="red">Error</Badge>
                  ) : (
                    <Badge color="gray">Pending</Badge>
                  )}

                  {isGenerating && prog?.itemsGenerated ? (
                    <span
                      className="whitespace-nowrap"
                      style={{ fontSize: 12, color: 'var(--color-accent-700)' }}
                    >
                      {prog.itemsGenerated} cards
                    </span>
                  ) : (
                    <span className="whitespace-nowrap" style={{ fontSize: 12, opacity: 0.5 }}>
                      {new Date(deck.updated_at).toLocaleDateString()}
                    </span>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(deck.id);
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
        title="Delete deck?"
        message={`Delete "${decks.find((d) => d.id === confirmDeleteId)?.title ?? 'this deck'}"? This can't be undone.`}
        onConfirm={() => {
          if (confirmDeleteId) deleteDeck(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
