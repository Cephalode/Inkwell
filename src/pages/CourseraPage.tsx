import { useEffect, useState } from 'react';
import Card from '../components/shared/Card';
import Spinner from '../components/shared/Spinner';
import EmptyState from '../components/shared/EmptyState';
import {
  getCourseraStatus, linkCoursera, unlinkCoursera, listCourseraCourses, getCourseOutline, importCourseraCourse, importCourseraTextbooks,
  type CourseraCourse, type CourseraModule,
} from '../services/api/coursera';
import { HiDocumentText, HiLockClosed, HiAcademicCap, HiLink, HiTrash, HiArrowLeft, HiCheckCircle, HiPlus } from 'react-icons/hi';
import { TYPE_ICON, TYPE_LABEL } from '../components/coursera/typeMeta';

export default function CourseraPage() {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [cauth, setCauth] = useState('');
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState('');
  const [courses, setCourses] = useState<CourseraCourse[] | null>(null);
  const [outline, setOutline] = useState<{ course: CourseraCourse; modules: CourseraModule[] } | null>(null);
  const [loadingOutline, setLoadingOutline] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [bookNote, setBookNote] = useState('');

  const markImported = (slug: string) =>
    setCourses((cs) => (cs ? cs.map((c) => (c.slug === slug ? { ...c, imported: true } : c)) : cs));

  const handleImport = async (course: CourseraCourse, e: React.MouseEvent) => {
    e.stopPropagation();
    setImporting(course.slug);
    setBookNote('');
    try {
      if (!course.imported) {
        await importCourseraCourse(course.slug, course.name);
        markImported(course.slug);
      }
      try {
        const r = await importCourseraTextbooks(course.slug);
        setBookNote(`Textbooks: ${r.results.join('; ')}`);
      } catch (err) { setBookNote(`Textbook import failed: ${err instanceof Error ? err.message : String(err)}`); }
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setImporting(null); }
  };

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
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLinking(false); }
  };

  const handleUnlink = async () => {
    await unlinkCoursera().catch(() => {});
    setLinked(false); setCourses(null); setOutline(null);
  };

  const openCourse = async (course: CourseraCourse) => {
    setLoadingOutline(true); setError('');
    try { setOutline({ course, modules: await getCourseOutline(course.slug) }); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoadingOutline(false); }
  };

  if (linked === null) {
    return <div className="flex justify-center py-10"><Spinner /></div>;
  }

  if (!linked) {
    return (
      <div className="space-y-4 sm:space-y-6 max-w-2xl">
        <div>
          <div className="card-kicker" style={{ fontSize: 13 }}>Integrations</div>
          <h1 style={{ fontSize: 32, margin: 'var(--space-1) 0 var(--space-2)' }}>Link Coursera Account</h1>
          <p style={{ fontSize: 15, opacity: 0.6, margin: 0 }}>Pull your coursework links straight from Coursera</p>
        </div>
        <div className="card p-5 space-y-4">
          <div className="text-sm space-y-2">
            <p className="font-medium">Paste your CAUTH session cookie:</p>
            <ol className="list-decimal list-inside space-y-1" style={{ opacity: 0.7 }}>
              <li>Log in at <a href="https://www.coursera.org" target="_blank" rel="noreferrer" className="hover:underline" style={{ color: 'var(--color-accent-700)' }}>coursera.org</a></li>
              <li>DevTools (F12) → Application → Cookies → coursera.org</li>
      <li>Copy the full <code style={{ color: 'var(--color-accent-700)' }}>CAUTH</code> value</li>
            </ol>
          </div>
          <input
            type="password"
            value={cauth}
            onChange={(e) => setCauth(e.target.value)}
            placeholder="Paste CAUTH cookie value"
            className="input font-mono"
          />
          {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
          <button
            onClick={handleLink}
            disabled={linking || !cauth.trim()}
            className="btn btn-primary"
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
            <button
              onClick={() => setOutline(null)}
              className="flex items-center gap-1 text-sm mb-1 transition-colors text-[var(--color-neutral-600)] hover:text-[var(--color-text)]"
            >
              <HiArrowLeft className="w-4 h-4" /> All courses
            </button>
            <h1 className="truncate" style={{ fontSize: 28, margin: 0 }}>{outline.course.name}</h1>
          </div>
          <a href={`https://www.coursera.org/learn/${outline.course.slug}`} target="_blank" rel="noreferrer"
             className="btn btn-primary shrink-0 whitespace-nowrap">
            <HiLink className="w-4 h-4" /> Open on Coursera
          </a>
        </div>

        <div className="space-y-4">
          {outline.modules.map((mod, mi) => (
            <Card key={mod.id} header={
              <h2 className="text-base">Module {mi + 1}: {mod.name}</h2>
            }>
              <div className="space-y-4">
                {mod.lessons.map((lesson) => (
                  <div key={lesson.id}>
                    <p className="text-sm font-medium mb-2" style={{ opacity: 0.75 }}>{lesson.name}</p>
                    <ul className="space-y-1">
                      {lesson.items.map((item) => {
                        const Icon = TYPE_ICON[item.type] ?? HiDocumentText;
                        const label = TYPE_LABEL[item.type] ?? item.type;
                        return (
                          <li key={item.id}>
                            <a href={item.url} target="_blank" rel="noreferrer"
                               className="flex items-center gap-2.5 px-2.5 py-1.5 transition-colors group hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
                               style={{ borderRadius: 'var(--radius-md)' }}>
                              <Icon
                                className="w-4 h-4 shrink-0"
                                style={{
                                  color: item.type.includes('programming')
                                    ? 'var(--color-accent-600)'
                                    : item.type === 'lecture'
                                      ? 'var(--color-accent)'
                                      : 'var(--color-neutral-600)',
                                }}
                              />
                              <span className="text-sm min-w-0 truncate">{item.name}</span>
                              <span className="ml-auto shrink-0 text-[11px] uppercase tracking-wide" style={{ opacity: 0.5 }}>{label}</span>
                              {item.locked && <HiLockClosed className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--color-warning)' }} title="Locked" />}
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
          <div className="card-kicker" style={{ fontSize: 13 }}>Integrations</div>
          <h1 style={{ fontSize: 32, margin: 'var(--space-1) 0 var(--space-2)' }}>My Coursera Courses</h1>
          <p style={{ fontSize: 15, opacity: 0.6, margin: 0 }}>All available coursework, in course order</p>
        </div>
        <button onClick={handleUnlink}
          className="flex items-center gap-2 px-3 py-2 text-sm transition-colors text-[var(--color-neutral-600)] hover:text-[var(--color-danger)]">
          <HiTrash className="w-4 h-4" /> Unlink
        </button>
      </div>
      {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      {bookNote && <p className="text-sm" style={{ opacity: 0.6 }}>{bookNote}</p>}
      {courses === null ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : courses.length === 0 ? (
        <EmptyState icon={<HiAcademicCap className="w-12 h-12" style={{ color: 'var(--color-accent)' }} />} title="No enrolled courses" description="Enroll in a course on Coursera and refresh here" />
      ) : (
        <div className="space-y-8">
          {([
            ['enrolled', 'In Progress', 'var(--color-accent)'],
            ['completed', 'Completed', 'var(--color-success)'],
            ['unenrolled', 'Unenrolled', ''],
          ] as const).map(([status, label, color]) => {
            const list = courses.filter((c) => c.status === status);
            if (!list.length) return null;
            const iconColor = status === 'enrolled'
              ? 'var(--color-accent)'
              : status === 'completed'
                ? 'var(--color-success)'
                : 'var(--color-neutral-600)';
            return (
              <section key={status}>
                <h2 className="section-label mb-3" style={color ? { color, opacity: 0.85 } : undefined}>{label} ({list.length})</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {list.map((c) => (
                    <Card key={c.id} onClick={() => openCourse(c)} className="group">
                      <div className="flex items-start gap-3">
                        <div
                          className="w-10 h-10 flex items-center justify-center shrink-0"
                          style={{
                            borderRadius: 'var(--radius-md)',
                            background: `color-mix(in srgb, ${iconColor} 14%, transparent)`,
                            border: `1px solid color-mix(in srgb, ${iconColor} 30%, transparent)`,
                          }}
                        >
                          {status === 'completed'
                            ? <HiCheckCircle className="w-5 h-5" style={{ color: iconColor }} />
                            : <HiAcademicCap className="w-5 h-5" style={{ color: iconColor }} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-base truncate">{c.name}</h3>
                          <p className="text-xs mt-0.5 truncate" style={{ opacity: 0.5 }}>{c.slug}</p>
                        </div>
                        {c.imported ? (
                          <>
                            <span
                              className="shrink-0 flex items-center gap-1 text-[11px] font-medium px-2 py-1"
                              style={{
                                color: 'var(--color-success)',
                                background: 'color-mix(in srgb, var(--color-success) 10%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--color-success) 25%, transparent)',
                                borderRadius: 'var(--radius-sm)',
                              }}
                            >
                              <HiCheckCircle className="w-3.5 h-3.5" /> In Courses
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleImport(c, e); }}
                              disabled={importing === c.slug}
                              title="Fetch PDF textbooks into this course"
                              className="btn btn-ghost shrink-0"
                              style={{ padding: '4px 8px', fontSize: 12, border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)' }}
                            >
                              <HiDocumentText className="w-3.5 h-3.5" /> {importing === c.slug ? 'Fetching…' : 'Textbooks'}
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={(e) => handleImport(c, e)}
                            disabled={importing === c.slug}
                            title="Import into Courses"
                            className="btn btn-ghost shrink-0"
                            style={{ padding: '4px 8px', fontSize: 12, border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)' }}
                          >
                            <HiPlus className="w-3.5 h-3.5" /> {importing === c.slug ? 'Importing…' : 'Import'}
                          </button>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {loadingOutline && <div className="flex justify-center py-10"><Spinner /></div>}
    </div>
  );
}
