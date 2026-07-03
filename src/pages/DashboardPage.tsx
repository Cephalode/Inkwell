import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentStore } from '../store/documentStore';
import { useCourseStore } from '../store/courseStore';
import { useCourses } from '../hooks/useCourses';
import Card from '../components/shared/Card';
import {
  HiSparkles,
  HiArrowRight,
  HiPlus,
  HiBookOpen,
  HiChatBubbleLeftRight,
  HiDocumentPlus,
} from 'react-icons/hi2';
import { HiDocumentAdd, HiPlay } from 'react-icons/hi';

export default function DashboardPage() {
  const navigate = useNavigate();
  const documents = useDocumentStore((s) => s.documents);
  const courses = useCourseStore((s) => s.courses);
  const { loadCourses } = useCourses();
  const [newCourseName, setNewCourseName] = useState('');
  const [showNewCourse, setShowNewCourse] = useState(false);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

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

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">
            Welcome back 👋
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {documents.length === 0
              ? 'Upload some documents to get started'
              : `${documents.length} document${documents.length !== 1 ? 's' : ''} across ${courses.length} course${courses.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => navigate('/documents')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
        >
          <HiDocumentAdd className="w-4 h-4" />
          <span className="hidden sm:inline">Upload</span>
        </button>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Continue studying — featured, spans 2 cols */}
        {recentDoc && (
          <div
            onClick={() => navigate(`/documents/${recentDoc.id}`)}
            className="md:col-span-2 lg:col-span-2 rounded-2xl bg-slate-800/60 border border-slate-700/50 p-5 cursor-pointer hover:border-cyan-600/40 hover:bg-slate-800/80 transition-all group relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-600/5 rounded-full -translate-y-10 translate-x-10" />
            <p className="text-xs text-cyan-400 font-medium uppercase tracking-wider mb-3">Continue studying</p>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white group-hover:text-cyan-300 transition-colors">
                  {recentDoc.name}
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  {recentDoc.chapterMarkers?.length
                    ? `${recentDoc.chapterMarkers.length} chapters detected`
                    : `${(recentDoc.size / 1024).toFixed(0)} KB · ${recentDoc.type.toUpperCase()}`}
                </p>
                {recentDoc.chapterMarkers && recentDoc.chapterMarkers.length > 0 && (
                  <div className="mt-3 flex items-center gap-4">
                    <div className="flex-1 max-w-xs">
                      <div className="w-full h-1.5 bg-slate-700 rounded-full">
                        <div className="h-full bg-cyan-500 rounded-full" style={{ width: '62%' }} />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">Last opened</p>
                    </div>
                    <span className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                      <HiPlay className="w-3.5 h-3.5" />
                      Resume
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Empty state when no documents — upload prompt */}
        {!recentDoc && (
          <div
            onClick={() => navigate('/documents')}
            className="md:col-span-2 lg:col-span-2 rounded-2xl border-2 border-dashed border-slate-700 p-8 cursor-pointer hover:border-cyan-600/40 hover:bg-slate-800/30 transition-all flex flex-col items-center justify-center gap-3"
          >
            <HiDocumentAdd className="w-10 h-10 text-slate-500" />
            <h3 className="text-lg font-semibold text-slate-300">Upload your first document</h3>
            <p className="text-sm text-slate-500 text-center max-w-sm">
              Drop PDFs, EPUBs, DOCX, presentations, or images. Inkwell will classify them and extract chapters automatically.
            </p>
            <span className="mt-2 flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors">
              <HiDocumentAdd className="w-4 h-4" />
              Upload files
            </span>
          </div>
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
                <p className="text-sm text-slate-200">Ask Inkwell AI</p>
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
            <p className="text-sm font-medium text-slate-200 mb-1">Ask Inkwell AI</p>
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
    </div>
  );
}
