// Learn mode (E6 / PRD 3) — guided lesson list + reader.
// List: create a lesson from any document. Reader: TOC + typed sections,
// quiz sections graded inline, progress persists to the lesson row.
import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HiPlus, HiX, HiArrowLeft, HiCheck, HiRefresh, HiTrash } from 'react-icons/hi';
import Spinner from '../components/shared/Spinner';
import { useDocumentStore } from '../store/documentStore';

// ── Types (mirror server routes/lessons.ts) ─────────────────────────────────
interface QuizQuestion {
  qtype: string;
  prompt: string;
  options?: string[];
  correct_answer: string | boolean;
  explanation: string;
  hint?: string;
}

interface LessonSection {
  id: string;
  idx: number;
  kind: 'intro' | 'teaching' | 'quiz';
  title: string;
  content: { markdown?: string; questions?: QuizQuestion[] } | null;
  generation_status: 'pending' | 'complete' | 'failed';
}

interface Lesson {
  id: string;
  document_id: string | null;
  title: string;
  status: 'pending' | 'generating' | 'ready' | 'error';
  error: string | null;
  percent_completed: number;
  progress: { completed?: number[] } | null;
  sections: LessonSection[];
  document_name?: string | null;
}

const listFetch = async (): Promise<Response> => fetch('/api/lessons');

export default function LessonsPage() {
  const { lessonId } = useParams<{ lessonId?: string }>();
  if (lessonId) return <LessonReader lessonId={lessonId} />;
  return <LessonList />;
}

// ── List ────────────────────────────────────────────────────────────────────
function LessonList() {
  const navigate = useNavigate();
  const documents = useDocumentStore((s) => s.documents);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await listFetch();
      setLessons(await res.json());
    } catch {
      setLessons([]);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Poll while anything is mid-generation (section stream fills in place).
  const anyGenerating = (lessons || []).some((l) => l.status === 'pending' || l.status === 'generating');
  useEffect(() => {
    if (!anyGenerating) return;
    const t = setInterval(() => { void load(); }, 4000);
    return () => clearInterval(t);
  }, [anyGenerating, load]);

  const create = async () => {
    if (!selectedDocId) return;
    setCreating(true);
    try {
      const res = await fetch('/api/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: selectedDocId }),
      });
      const lesson = (await res.json()) as { id: string };
      navigate(`/lessons/${lesson.id}`);
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/lessons/${id}`, { method: 'DELETE' });
    setLessons((ls) => (ls || []).filter((l) => l.id !== id));
  };

  return (
    <div className="space-y-4 sm:space-y-6" style={{ maxWidth: 860 }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="card-kicker" style={{ fontSize: 13 }}>Study tools</div>
          <h1 style={{ fontSize: 32, margin: 'var(--space-1) 0 var(--space-2)' }}>Lessons</h1>
          <p style={{ fontSize: 15, opacity: 0.6, margin: 0 }}>
            Guided, section-by-section lessons with checkpoint quizzes
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className={`btn whitespace-nowrap ${showForm ? 'btn-secondary' : 'btn-primary'}`}
        >
          {showForm ? <HiX className="w-4 h-4" /> : <HiPlus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'New Lesson'}
        </button>
      </div>

      {showForm && (
        <div className="card space-y-4" style={{ padding: 'var(--space-4)' }}>
          <select value={selectedDocId} onChange={(e) => setSelectedDocId(e.target.value)} className="input">
            <option value="">Select a document…</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <button onClick={create} disabled={!selectedDocId || creating} className="btn btn-primary">
            {creating ? 'Creating…' : 'Create & Generate'}
          </button>
          <p className="text-xs" style={{ opacity: 0.5, margin: 0 }}>
            Sections stream in — you can start reading while later ones generate.
          </p>
        </div>
      )}

      {lessons === null ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : lessons.length === 0 ? (
        <p className="text-sm py-6" style={{ opacity: 0.5 }}>
          No lessons yet — create one from a document to get a guided path through the material.
        </p>
      ) : (
        <div className="space-y-3">
          {lessons.map((l) => (
            <div key={l.id} className="flex items-center gap-3" style={{ padding: '12px 0', borderTop: '1px solid var(--color-neutral-300)' }}>
              <button onClick={() => navigate(`/lessons/${l.id}`)} className="flex-1 min-w-0 text-left">
                <div className="min-w-0" style={{ fontSize: 15 }}>
                  <span className="font-semibold">{l.title}</span>
                  {l.document_name && <span style={{ opacity: 0.5, fontSize: 13 }}> · {l.document_name}</span>}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-1.5 overflow-hidden" style={{ flex: 1, maxWidth: 240, background: 'var(--color-neutral-300)', borderRadius: 'var(--radius-sm)' }}>
                    <div className="h-full" style={{ width: `${l.percent_completed}%`, background: 'var(--color-accent)' }} />
                  </div>
                  <span className="text-xs" style={{ opacity: 0.5 }}>{l.percent_completed}%</span>
                  {(l.status === 'pending' || l.status === 'generating') && (
                    <span className="text-xs" style={{ color: 'var(--color-accent)' }}>generating…</span>
                  )}
                  {l.status === 'error' && <span className="text-xs" style={{ color: 'var(--color-danger)' }}>failed</span>}
                </div>
              </button>
              <button onClick={() => void remove(l.id)} className="btn btn-ghost" title="Delete lesson">
                <HiTrash className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Reader ──────────────────────────────────────────────────────────────────
function LessonReader({ lessonId }: { lessonId: string }) {
  const navigate = useNavigate();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answered, setAnswered] = useState<Record<string, { correct: boolean; explanation: string }>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/lessons/${lessonId}`);
      if (res.status === 404) { setNotFound(true); return; }
      setLesson(await res.json());
    } catch { /* keep old state, next poll retries */ }
  }, [lessonId]);

  useEffect(() => { void load(); }, [load]);
  const generating = lesson && (lesson.status === 'pending' || lesson.status === 'generating');
  useEffect(() => {
    if (!generating) return;
    const t = setInterval(() => { void load(); }, 4000);
    return () => clearInterval(t);
  }, [generating, load]);

  if (notFound) return <p className="p-6 text-sm" style={{ opacity: 0.6 }}>Lesson not found</p>;
  if (!lesson) return <div className="flex justify-center py-20"><Spinner /></div>;

  const sections = lesson.sections || [];
  const completed = new Set(lesson.progress?.completed || []);
  const current = sections[currentIdx];
  const isLast = currentIdx >= sections.length - 1;

  const markComplete = async (idx: number) => {
    if (completed.has(idx)) return;
    // optimistic
    setLesson((l) => l && ({
      ...l,
      progress: { completed: [...(l.progress?.completed || []), idx] },
      percent_completed: Math.round(((l.progress?.completed?.length || 0) + 1) / Math.max(1, l.sections.length) * 100),
    }));
    await fetch(`/api/lessons/${lessonId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completedIdx: idx }),
    }).catch(() => {});
  };

  const retrySection = async (sectionId: string) => {
    await fetch(`/api/lessons/${lessonId}/sections/${sectionId}/retry`, { method: 'POST' }).catch(() => {});
    void load();
  };

  const retryLesson = async () => {
    if (!lesson.document_id) return;
    const res = await fetch('/api/lessons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: lesson.document_id, title: lesson.title }),
    });
    const created = (await res.json()) as { id: string };
    navigate(`/lessons/${created.id}`, { replace: true });
  };

  return (
    <div className="space-y-5" style={{ maxWidth: 860 }}>
      <button onClick={() => navigate('/lessons')} className="btn btn-ghost">
        <HiArrowLeft className="w-4 h-4" /> All lessons
      </button>

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 style={{ fontSize: 28, margin: 0 }}>{lesson.title}</h1>
          <p style={{ opacity: 0.6, margin: 0 }}>
            {completed.size} of {sections.length} complete
            {generating ? ' · generating…' : ''}
          </p>
        </div>
        {/* Progress ring */}
        <div className="flex items-center justify-center shrink-0" style={{
          width: 52, height: 52, borderRadius: 999,
          background: `conic-gradient(var(--color-accent) ${lesson.percent_completed}%, var(--color-neutral-300) 0)`,
        }}>
          <div className="flex items-center justify-center" style={{
            width: 42, height: 42, borderRadius: 999, background: 'var(--color-bg, #191817)', fontSize: 12, fontWeight: 600,
          }}>
            {lesson.percent_completed}%
          </div>
        </div>
      </div>

      {lesson.status === 'error' && (
        <div className="card text-center py-6 space-y-3">
          <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{lesson.error || 'Lesson generation failed.'}</p>
          <button onClick={retryLesson} className="btn btn-secondary"><HiRefresh className="w-4 h-4" /> Try again</button>
        </div>
      )}

      {current && (
        <div className="card space-y-4" style={{ padding: 'var(--space-6)' }}>
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide" style={{ opacity: 0.5 }}>
              Section {currentIdx + 1} of {sections.length} · {current.kind}
            </p>
            <div className="flex gap-1.5">
              {sections.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => setCurrentIdx(i)}
                  title={s.title}
                  className="rounded-full"
                  style={{
                    width: 10, height: 10,
                    background: completed.has(i) ? 'var(--color-success)' : i === currentIdx ? 'var(--color-accent)' : 'var(--color-neutral-300)',
                    border: 'none', cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>
          <h2 className="text-xl">{current.title}</h2>

          {current.generation_status === 'pending' && (
            <div className="flex items-center gap-3 py-6 justify-center">
              <Spinner size="sm" />
              <span className="text-sm" style={{ opacity: 0.6 }}>Generating this section…</span>
            </div>
          )}

          {current.generation_status === 'failed' && (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm" style={{ color: 'var(--color-danger)' }}>This section failed to generate.</p>
              <button onClick={() => void retrySection(current.id)} className="btn btn-secondary">
                <HiRefresh className="w-4 h-4" /> Retry section
              </button>
            </div>
          )}

          {current.generation_status === 'complete' && current.content?.markdown && (
            <MarkdownLite markdown={current.content.markdown} />
          )}

          {current.generation_status === 'complete' && current.content?.questions && (
            <QuizSection
              questions={current.content.questions}
              answered={answered}
              onAnswer={(q, result) => setAnswered((a) => ({ ...a, [q]: result }))}
            />
          )}
        </div>
      )}

      <div className="flex gap-3 justify-between">
        <button onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))} disabled={currentIdx === 0} className="btn btn-secondary">
          Previous
        </button>
        {isLast ? (
          <button
            onClick={async () => { if (current) await markComplete(current.idx); navigate('/lessons'); }}
            className="btn btn-primary"
          >
            <HiCheck className="w-4 h-4" /> Finish lesson
          </button>
        ) : (
          <button
            onClick={async () => { if (current) await markComplete(current.idx); setCurrentIdx((i) => i + 1); }}
            className="btn btn-primary"
          >
            Next section
          </button>
        )}
      </div>
    </div>
  );
}

// ── Quiz section (checkpoint) ───────────────────────────────────────────────
function QuizSection({ questions, answered, onAnswer }: {
  questions: QuizQuestion[];
  answered: Record<string, { correct: boolean; explanation: string }>;
  onAnswer: (key: string, result: { correct: boolean; explanation: string }) => void;
}) {
  if (!questions || questions.length === 0) return <p className="text-sm" style={{ opacity: 0.5 }}>No questions generated.</p>;

  const grade = (key: string, q: QuizQuestion, value: string) => {
    const correct = q.qtype === 'true_false'
      ? String(q.correct_answer) === value
      : String(q.correct_answer).trim().toLowerCase() === value.trim().toLowerCase();
    onAnswer(key, { correct, explanation: q.explanation || '' });
  };

  return (
    <div className="space-y-5">
      {questions.map((q, qi) => {
        const key = `${qi}-${q.prompt.slice(0, 20)}`;
        const result = answered[key];
        return (
          <div key={key} className="space-y-2">
            <p className="text-sm font-semibold">{q.prompt}</p>
            {q.qtype === 'mcq' && (
              <div className="space-y-1.5">
                {(q.options || []).map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" name={key} disabled={!!result} onChange={() => grade(key, q, opt)} />
                    {opt}
                  </label>
                ))}
              </div>
            )}
            {q.qtype === 'true_false' && (
              <div className="flex gap-2">
                {['true', 'false'].map((v) => (
                  <button key={v} disabled={!!result} onClick={() => grade(key, q, v)} className="btn btn-secondary text-sm">
                    {v === 'true' ? 'True' : 'False'}
                  </button>
                ))}
              </div>
            )}
            {q.qtype === 'short_answer' && !result && (
              <ShortAnswer on_submit={(v) => grade(key, q, v)} />
            )}
            {result && (
              <p className="text-sm" style={{ color: result.correct ? 'var(--color-success)' : 'var(--color-danger)' }}>
                {result.correct ? '✓ Correct' : '✗ Not quite'} {result.explanation ? `— ${result.explanation}` : ''}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ShortAnswer({ on_submit }: { on_submit: (value: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="flex gap-2">
      <input value={value} onChange={(e) => setValue(e.target.value)} className="input" placeholder="Your answer…" />
      <button onClick={() => value.trim() && on_submit(value)} className="btn btn-secondary">Check</button>
    </div>
  );
}

// ── Minimal markdown (bold, headings, paragraphs — no new deps) ─────────────
function MarkdownLite({ markdown }: { markdown: string }) {
  const html = markdown
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .split(/\n{2,}/)
    .map((block) => (block.startsWith('<h') ? block : `<p>${block.replace(/\n/g, '<br/>')}</p>`))
    .join('\n');
  return <div className="space-y-3 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />;
}
