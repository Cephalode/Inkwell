import { useEffect, useState } from 'react';
import Card from '../components/shared/Card';
import Spinner from '../components/shared/Spinner';
import EmptyState from '../components/shared/EmptyState';
import {
  getCourseraStatus, linkCoursera, unlinkCoursera, listCourseraCourses, getCourseOutline,
  type CourseraCourse, type CourseraModule,
} from '../services/api/coursera';
import { HiPlay, HiDocumentText, HiCode, HiChatAlt2, HiLockClosed, HiClipboard, HiAcademicCap, HiLink, HiTrash, HiArrowLeft } from 'react-icons/hi';

const TYPE_ICON: Record<string, typeof HiPlay> = {
  lecture: HiPlay,
  supplement: HiDocumentText,
  programming: HiCode,
  gradedProgramming: HiCode,
  staffGraded: HiClipboard,
  peer: HiClipboard,
  discussionPrompt: HiChatAlt2,
  exam: HiAcademicCap,
};

const TYPE_LABEL: Record<string, string> = {
  lecture: 'Lecture',
  supplement: 'Reading',
  programming: 'Practice Lab',
  gradedProgramming: 'Graded Lab',
  staffGraded: 'Assignment',
  peer: 'Peer Review',
  discussionPrompt: 'Discussion',
  exam: 'Exam',
};

export default function CourseraPage() {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [cauth, setCauth] = useState('');
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState('');
  const [courses, setCourses] = useState<CourseraCourse[] | null>(null);
  const [outline, setOutline] = useState<{ course: CourseraCourse; modules: CourseraModule[] } | null>(null);
  const [loadingOutline, setLoadingOutline] = useState(false);

  useEffect(() => {
    getCourseraStatus()
      .then((s) => { setLinked(s.linked); if (s.linked) return listCourseraCourses().then(setCourses); })
      .catch((e) => setError(String(e.message || e)));
  }, []);

  const handleLink = async () => {
    setLinking(true); setError('');
    try {
      await linkCoursera(cauth.trim());
      setCauth('');
      setLinked(true);
      setCourses(await listCourseraCourses());
    } catch (e: any) { setError(e.message || String(e)); }
    finally { setLinking(false); }
  };

  const handleUnlink = async () => {
    await unlinkCoursera().catch(() => {});
    setLinked(false); setCourses(null); setOutline(null);
  };

  const openCourse = async (course: CourseraCourse) => {
    setLoadingOutline(true); setError('');
    try { setOutline({ course, modules: await getCourseOutline(course.slug) }); }
    catch (e: any) { setError(e.message || String(e)); }
    finally { setLoadingOutline(false); }
  };

  if (linked === null) {
    return <div className="flex justify-center py-10"><Spinner /></div>;
  }

  if (!linked) {
    return (
      <div className="space-y-4 sm:space-y-6 max-w-2xl">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">Link Coursera Account</h1>
          <p className="text-slate-400">Pull your coursework links straight from Coursera</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <div className="text-sm text-slate-300 space-y-2">
            <p className="font-medium text-slate-200">Paste your CAUTH session cookie:</p>
            <ol className="list-decimal list-inside space-y-1 text-slate-400">
              <li>Log in at <a href="https://www.coursera.org" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">coursera.org</a></li>
              <li>DevTools (F12) → Application → Cookies → coursera.org</li>
      <li>Copy the full <code className="text-cyan-400">CAUTH</code> value</li>
            </ol>
          </div>
          <input
            type="password"
            value={cauth}
            onChange={(e) => setCauth(e.target.value)}
            placeholder="Paste CAUTH cookie value"
            className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm font-mono"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            onClick={handleLink}
            disabled={linking || !cauth.trim()}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {linking ? 'Linking…' : 'Link account'}
          </button>
        </div>
      </div>
    );
  }

  if (outline) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <button onClick={() => setOutline(null)} className="flex items-center gap-1 text-sm text-slate-400 hover:text-white mb-1">
              <HiArrowLeft className="w-4 h-4" /> All courses
            </button>
            <h1 className="text-xl sm:text-2xl font-bold text-white truncate">{outline.course.name}</h1>
          </div>
          <a href={`https://www.coursera.org/learn/${outline.course.slug}`} target="_blank" rel="noreferrer"
             className="shrink-0 flex items-center gap-2 px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap">
            <HiLink className="w-4 h-4" /> Open on Coursera
          </a>
        </div>

        <div className="space-y-4">
          {outline.modules.map((mod, mi) => (
            <Card key={mod.id} header={
              <h2 className="text-base font-semibold text-white">Module {mi + 1}: {mod.name}</h2>
            }>
              <div className="space-y-4">
                {mod.lessons.map((lesson) => (
                  <div key={lesson.id}>
                    <p className="text-sm font-medium text-slate-300 mb-2">{lesson.name}</p>
                    <ul className="space-y-1">
                      {lesson.items.map((item) => {
                        const Icon = TYPE_ICON[item.type] ?? HiDocumentText;
                        const label = TYPE_LABEL[item.type] ?? item.type;
                        return (
                          <li key={item.id}>
                            <a href={item.url} target="_blank" rel="noreferrer"
                               className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-700/40 transition-colors group">
                              <Icon className={`w-4 h-4 shrink-0 ${item.type.includes('programming') ? 'text-teal-400' : item.type === 'lecture' ? 'text-cyan-400' : 'text-slate-400'}`} />
                              <span className="text-sm text-slate-200 group-hover:text-white min-w-0 truncate">{item.name}</span>
                              <span className="ml-auto shrink-0 text-[11px] uppercase tracking-wide text-slate-500 group-hover:text-slate-400">{label}</span>
                              {item.locked && <HiLockClosed className="w-3.5 h-3.5 shrink-0 text-amber-400" title="Locked" />}
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">My Coursera Courses</h1>
          <p className="text-slate-400">All available coursework, in course order</p>
        </div>
        <button onClick={handleUnlink}
          className="flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-red-400 transition-colors text-sm">
          <HiTrash className="w-4 h-4" /> Unlink
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {courses === null ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : courses.length === 0 ? (
        <EmptyState icon={<HiAcademicCap className="w-12 h-12 text-cyan-400" />} title="No enrolled courses" description="Enroll in a course on Coursera and refresh here" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((c) => (
            <Card key={c.id} onClick={() => openCourse(c)} className="group">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center shrink-0">
                  <HiAcademicCap className="w-5 h-5 text-cyan-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-white truncate group-hover:text-cyan-400 transition-colors">{c.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{c.slug}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {loadingOutline && <div className="flex justify-center py-10"><Spinner /></div>}
    </div>
  );
}
