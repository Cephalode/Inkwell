import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDocumentStore } from '../store/documentStore';
import { useCourseStore } from '../store/courseStore';
import { useCourses } from '../hooks/useCourses';
import { useFlashcardStore } from '../store/flashcardStore';
import { useSrsStore, isDue } from '../store/srsStore';
import { useDeadlineStore } from '../store/deadlineStore';
import { useUIStore } from '../store/uiStore';
import { useSettingsStore } from '../store/settingsStore';
import Card from '../components/shared/Card';
import {
  HiSparkles,
  HiArrowRight,
  HiPlus,
  HiChatBubbleLeftRight,
} from 'react-icons/hi2';
import { HiDocumentAdd, HiPlay } from 'react-icons/hi';

const HOUR = 3_600_000;
const DAY = 86_400_000;

export default function DashboardPage() {
  const navigate = useNavigate();
  const documents = useDocumentStore((s) => s.documents);
  const courses = useCourseStore((s) => s.courses);
  const { loadCourses } = useCourses();
  const decks = useFlashcardStore((s) => s.decks);
  const cardsByDeckId = useFlashcardStore((s) => s.cardsByDeckId);
  const fetchDecks = useFlashcardStore((s) => s.fetchDecks);
  const srsMap = useSrsStore((s) => s.srs);
  const srsEvents = useSrsStore((s) => s.events);
  const deadlines = useDeadlineStore((s) => s.deadlines);
  const todayDone = useUIStore((s) => s.todayDone);
  const setTodayDone = useUIStore((s) => s.setTodayDone);
  const showWeekStats = useSettingsStore((s) => s.settings.showWeekStats ?? true);
  const [newCourseName, setNewCourseName] = useState('');
  const [showNewCourse, setShowNewCourse] = useState(false);
  // Render-stable timestamp: taken once per mount; times stay human-plausible
  // without calling Date.now() during render.
  const [mountedAt] = useState(() => Date.now());

  useEffect(() => {
    loadCourses();
    fetchDecks().catch(() => {});
  }, [loadCourses, fetchDecks]);

  const recentDoc = documents[0];
  const unclassified = documents.filter((d) => d.classifyStatus === 'pending' || d.classifyStatus === 'classifying').length;
  const recentDocs = documents.slice(1, 4);

  const COURSE_COLORS = ['bg-cyan-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-blue-500'];
  const courseColor = (i: number) => COURSE_COLORS[i % COURSE_COLORS.length];

  const handleNewCourse = async () => {
    const name = newCourseName.trim();
    if (!name) return;
    const { addCourse } = useCourseStore.getState();
    const apiCreate = (await import('../services/api/client')).createCourse;
    const course = await apiCreate({ name });
    addCourse(course);
    setNewCourseName('');
    setShowNewCourse(false);
    navigate(`/courses/${course.id}`);
  };

  // ── Today plan (derived — no effects, no sync state) ────────────────────
  const now = mountedAt;
  const today = new Date(now);
  const kicker = today.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  interface TodayTask {
    key: string;
    label: string;
    sub: string;
    estimate: number;
    to: string;
  }

  const tasks = useMemo<TodayTask[]>(() => {
    const out: TodayTask[] = [];
    // (a) decks with due cards (only decks whose cards are already loaded)
    for (const deck of decks) {
      const cards = cardsByDeckId[deck.id];
      if (!cards) continue;
      const due = cards.filter((c) => isDue(srsMap[c.id], now)).length;
      if (due > 0) {
        out.push({ key: `deck:${deck.id}`, label: `Review ${deck.title}`, sub: `${due} card${due !== 1 ? 's' : ''} due`, estimate: 10, to: `/flashcards/${deck.id}` });
      }
    }
    // (b) deadlines within 7 days
    for (const d of deadlines) {
      if (d.dueAt <= now + 7 * DAY) {
        const course = courses.find((c) => c.id === d.courseId);
        out.push({ key: `dl:${d.id}`, label: d.title, sub: course ? course.name : 'Deadline', estimate: 5, to: d.courseId ? `/courses/${d.courseId}` : '/deadlines' });
      }
    }
    // (c) keep studying the most recent document
    if (recentDoc) {
      out.push({ key: `doc:${recentDoc.id}`, label: `Continue ${recentDoc.name}`, sub: 'Last opened', estimate: 15, to: `/documents/${recentDoc.id}` });
    }
    return out.slice(0, 6);
  }, [decks, cardsByDeckId, srsMap, deadlines, courses, recentDoc, now]);

  const totalMinutes = tasks.reduce((sum, t) => sum + (todayDone[t.key] ? 0 : t.estimate), 0);
  const doneCount = tasks.filter((t) => todayDone[t.key]).length;

  const dueSoon = useMemo(
    () => [...deadlines].sort((a, b) => a.dueAt - b.dueAt).slice(0, 4),
    [deadlines]
  );

  const weekStats = useMemo(() => {
    const weekAgo = now - 7 * DAY;
    const evts = srsEvents.filter((e) => e.at >= weekAgo);
    const hours = new Set(evts.map((e) => Math.floor(e.at / HOUR)));
    return { cards: evts.length, sessions: hours.size };
  }, [srsEvents, now]);

  return (
    <div className="space-y-6">
      {/* Today header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-cyan-400 font-medium uppercase tracking-wider">{kicker}</p>
          <h1 className="text-xl sm:text-2xl font-bold text-white mt-0.5">
            {doneCount < tasks.length ? 'Your study plan' : doneCount > 0 ? 'Plan complete 🎉' : 'Welcome back 👋'}
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {tasks.length === 0
              ? documents.length === 0
                ? 'Upload some documents to get started'
                : 'Nothing due today — nice.'
              : `${doneCount} of ${tasks.length} done · about ${totalMinutes} minutes left`}
          </p>
        </div>
        <Link
          to="/documents"
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
        >
          <HiDocumentAdd className="w-4 h-4" />
          <span className="hidden sm:inline">Upload</span>
        </Link>
      </div>

      {/* Today checklist */}
      {tasks.length > 0 && (
        <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 p-2">
          {tasks.map((t) => {
            const done = !!todayDone[t.key];
            return (
              <div
                key={t.key}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${done ? 'opacity-50' : 'hover:bg-slate-700/30'}`}
              >
                <input
                  type="checkbox"
                  checked={done}
                  onChange={(e) => setTodayDone(t.key, e.target.checked)}
                  className="w-4 h-4 rounded accent-cyan-500 shrink-0"
                />
                <button onClick={() => navigate(t.to)} className="flex-1 min-w-0 text-left">
                  <p className={`text-sm truncate ${done ? 'line-through text-slate-500' : 'text-slate-200'}`}>{t.label}</p>
                  <p className="text-xs text-slate-500 truncate">{t.sub}</p>
                </button>
                <span className="text-xs text-slate-500 shrink-0">~{t.estimate} min</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Due soon */}
        {dueSoon.length > 0 && (
          <Card>
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Due soon</p>
                <Link to="/deadlines" className="text-xs text-cyan-500 hover:text-cyan-400 transition-colors">
                  All deadlines →
                </Link>
              </div>
              {dueSoon.map((d) => {
                const overdue = d.dueAt < now;
                const tomorrow = d.dueAt >= now && d.dueAt < now + 2 * DAY;
                return (
                  <button
                    key={d.id}
                    onClick={() => navigate(d.courseId ? `/courses/${d.courseId}` : '/deadlines')}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-slate-700/40 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 truncate">{d.title}</p>
                      <p className={`text-xs ${overdue ? 'text-red-400' : tomorrow ? 'font-semibold text-[var(--color-accent-700)]' : 'text-slate-500'}`}>
                        {overdue
                          ? 'Overdue'
                          : d.dueAt < now + DAY
                            ? 'Today'
                            : d.dueAt < now + 2 * DAY
                              ? 'Tomorrow'
                              : new Date(d.dueAt).toLocaleDateString()}
                      </p>
                    </div>
                    <HiArrowRight className="w-4 h-4 text-slate-600 shrink-0" />
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        {/* Quick actions card */}
        <Card>
          <div className="space-y-2">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-3">Quick actions</p>

            <button
              onClick={() => navigate('/documents')}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-700/40 hover:bg-slate-700 transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-cyan-600/20 flex items-center justify-center text-cyan-400 shrink-0">
                <HiDocumentAdd className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm text-slate-200">Upload files</p>
                <p className="text-xs text-slate-500">PDF, EPUB, DOCX, and more</p>
              </div>
            </button>

            <button
              onClick={() => {
                const gc = document.querySelector<HTMLButtonElement>('[data-global-chat-trigger]');
                gc?.click();
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-700/40 hover:bg-slate-700 transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-violet-600/20 flex items-center justify-center text-violet-400 shrink-0">
                <HiChatBubbleLeftRight className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm text-slate-200">Ask the Tutor</p>
                <p className="text-xs text-slate-500">Chat about your documents</p>
              </div>
            </button>

            {unclassified > 0 && (
              <button
                onClick={() => navigate('/documents')}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/15 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                  <HiSparkles className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm text-amber-300">{unclassified} classifying</p>
                  <p className="text-xs text-amber-500/60">AI is analyzing your uploads</p>
                </div>
              </button>
            )}
          </div>
        </Card>

        {/* This week stats strip */}
        {showWeekStats && (
          <Card>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-3">This week</p>
            <div className="flex items-center gap-6">
              <div>
                <p className="text-2xl font-bold text-cyan-400 tabular-nums">{weekStats.cards}</p>
                <p className="text-xs text-slate-500">cards graded</p>
              </div>
              <div className="h-8 w-px bg-slate-700/60" />
              <div>
                <p className="text-2xl font-bold text-cyan-400 tabular-nums">{weekStats.sessions}</p>
                <p className="text-xs text-slate-500">study sessions</p>
              </div>
            </div>
          </Card>
        )}

        {/* Courses */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider">Courses</h3>
            {showNewCourse ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  placeholder="Course name…"
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNewCourse();
                    if (e.key === 'Escape') { setShowNewCourse(false); setNewCourseName(''); }
                  }}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 w-40"
                />
                <button
                  onClick={handleNewCourse}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => { setShowNewCourse(false); setNewCourseName(''); }}
                  className="px-2 py-1.5 text-slate-500 hover:text-slate-300 text-xs transition-colors"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowNewCourse(true)}
                className="text-xs text-cyan-500 hover:text-cyan-400 transition-colors"
              >
                + New course
              </button>
            )}
          </div>
          {courses.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {courses.map((course, i) => (
                <div
                  key={course.id}
                  onClick={() => navigate(`/courses/${course.id}`)}
                  className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-4 cursor-pointer hover:border-slate-600 hover:bg-slate-800/80 transition-all"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-2 h-6 rounded-full ${courseColor(i)}`} />
                    <p className="text-sm font-medium text-white truncate">{course.name}</p>
                  </div>
                  <p className="text-xs text-slate-500">
                    {course.documentIds.length} doc{course.documentIds.length !== 1 ? 's' : ''}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div
              onClick={() => setShowNewCourse(true)}
              className="rounded-xl border-2 border-dashed border-slate-700/50 p-6 cursor-pointer hover:border-cyan-600/30 hover:bg-slate-800/20 transition-all flex items-center justify-center gap-2"
            >
              <HiPlus className="w-4 h-4 text-slate-500" />
              <span className="text-sm text-slate-500">Create your first course</span>
            </div>
          )}
        </div>

        {/* Ask AI (standalone card on mobile/tablet) */}
        <Card className="md:hidden">
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-12 h-12 rounded-2xl bg-violet-600/20 flex items-center justify-center text-violet-400 mb-3">
              <HiChatBubbleLeftRight className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-slate-200 mb-1">Ask the Tutor</p>
            <p className="text-xs text-slate-500 mb-3">Questions about any of your documents</p>
            <button
              onClick={() => {
                const gc = document.querySelector<HTMLButtonElement>('[data-global-chat-trigger]');
                gc?.click();
              }}
              className="bg-violet-600 hover:bg-violet-500 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors"
            >
              Start chat →
            </button>
          </div>
        </Card>

        {/* Recent documents */}
        {recentDocs.length > 0 && (
          <div className={recentDoc ? 'lg:col-span-3' : 'lg:col-span-2'}>
            <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Recent documents</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recentDocs.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => navigate(`/documents/${doc.id}`)}
                  className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-4 cursor-pointer hover:border-slate-600 hover:bg-slate-800/80 transition-all flex items-center gap-3"
                >
                  <span className="text-lg shrink-0">
                    {doc.type === 'pdf' ? '📄' : doc.type === 'epub' ? '📖' : doc.type === 'docx' ? '📝' : doc.type === 'pptx' ? '📊' : '📎'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{doc.name}</p>
                    <p className="text-xs text-slate-500">
                      {doc.chapterMarkers?.length ? `${doc.chapterMarkers.length} chapters` : doc.type.toUpperCase()}
                      {doc.tags.length > 0 && ` · ${doc.tags.slice(0, 2).join(', ')}`}
                    </p>
                  </div>
                  <HiArrowRight className="w-4 h-4 text-slate-600 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Empty state when no documents — upload prompt */}
      {!recentDoc && tasks.length === 0 && (
        <div
          onClick={() => navigate('/documents')}
          className="rounded-2xl border-2 border-dashed border-slate-700 p-8 cursor-pointer hover:border-cyan-600/40 hover:bg-slate-800/30 transition-all flex flex-col items-center justify-center gap-3"
        >
          <HiDocumentAdd className="w-10 h-10 text-slate-500" />
          <h3 className="text-lg font-semibold text-slate-300">Upload your first document</h3>
          <p className="text-sm text-slate-500 text-center max-w-sm">
            Drop PDFs, EPUBs, DOCX, presentations, or images. Inkwell will classify them and extract chapters automatically.
          </p>
          <span className="mt-2 flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors">
            <HiPlay className="w-4 h-4" />
            Upload files
          </span>
        </div>
      )}
    </div>
  );
}
