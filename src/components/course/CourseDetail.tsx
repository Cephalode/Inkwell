import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiArrowLeft, HiDocumentText, HiX, HiPlus, HiChevronUp, HiLockClosed, HiExternalLink, HiRefresh } from 'react-icons/hi';
import EmptyState from '../shared/EmptyState';
import Spinner from '../shared/Spinner';
import { Course } from '../../types/course';
import { DocumentFile } from '../../types/document';
import { getCourseOutline, type CourseraModule } from '../../services/api/coursera';
import { TYPE_ICON, TYPE_LABEL, TYPE_TAB } from '../coursera/typeMeta';

interface CourseDetailProps {
  course: Course;
  allDocuments: DocumentFile[];
  onBack: () => void;
  onRemoveDoc: (courseId: string, docId: string) => void;
  onAddDoc: (courseId: string, docId: string) => void;
}

type Tab = 'documents' | 'lectures' | 'labs' | 'assignments';

interface OutlineItem { moduleId: string; moduleName: string; lessonName: string; itemId: string; name: string; type: string; locked: boolean; url: string; }

function flatten(modules: CourseraModule[]): OutlineItem[] {
  const out: OutlineItem[] = [];
  for (const mod of modules)
    for (const lesson of mod.lessons)
      for (const item of lesson.items)
        out.push({ moduleId: mod.id, moduleName: mod.name, lessonName: lesson.name, itemId: item.id, name: item.name, type: item.type, locked: item.locked, url: item.url });
  return out;
}

function CourseraItems({ items, slug }: { items: OutlineItem[]; slug: string }) {
  if (items.length === 0) {
    return <EmptyState icon="🔗" title="Nothing here yet" description="No items of this kind in this course" />;
  }
  const byModule = new Map<string, { moduleName: string; items: OutlineItem[] }>();
  for (const it of items) {
    if (!byModule.has(it.moduleId)) byModule.set(it.moduleId, { moduleName: it.moduleName, items: [] });
    byModule.get(it.moduleId)!.items.push(it);
  }
  return (
    <div className="space-y-5">
      {[...byModule.values()].map((mod) => (
        <div key={mod.moduleName}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{mod.moduleName}</h3>
          <div className="space-y-1.5">
            {mod.items.map((it) => {
              const Icon = TYPE_ICON[it.type] ?? HiDocumentText;
              return (
                <a key={it.itemId} href={it.url} target="_blank" rel="noreferrer"
                   className="flex items-center gap-3 px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl hover:bg-slate-800/80 transition-colors group">
                  <Icon className={`w-4 h-4 shrink-0 ${it.type.includes('programming') ? 'text-teal-400' : it.type === 'lecture' ? 'text-cyan-400' : 'text-slate-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate group-hover:text-white">{it.name}</p>
                    <p className="text-xs text-slate-500 truncate">{it.lessonName}</p>
                  </div>
                  <span className="shrink-0 text-[11px] uppercase tracking-wide text-slate-500">{TYPE_LABEL[it.type] ?? it.type}</span>
                  {it.locked && <HiLockClosed className="w-3.5 h-3.5 shrink-0 text-amber-400" title="Locked" />}
                  <HiExternalLink className="w-3.5 h-3.5 shrink-0 text-slate-600 group-hover:text-cyan-400 transition-colors" />
                </a>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-xs text-slate-600">Opens on coursera.org/learn/{slug}</p>
    </div>
  );
}

export default function CourseDetail({ course, allDocuments, onBack, onRemoveDoc, onAddDoc }: CourseDetailProps) {
  const navigate = useNavigate();
  const [showAddDocs, setShowAddDocs] = useState(false);
  const [tab, setTab] = useState<Tab>('documents');
  const [outline, setOutline] = useState<CourseraModule[] | null>(null);
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [outlineError, setOutlineError] = useState('');

  const hasCoursera = !!course.courseraSlug;
  const items = outline ? flatten(outline) : [];

  const loadOutline = async (force = false) => {
    if (!course.courseraSlug || (outline && !force)) return;
    setOutlineLoading(true); setOutlineError('');
    try { setOutline(await getCourseOutline(course.courseraSlug)); }
    catch (e) { setOutlineError(e instanceof Error ? e.message : String(e)); }
    finally { setOutlineLoading(false); }
  };

  const openTab = (t: Tab) => {
    setTab(t);
    if (hasCoursera && t !== 'documents' && !outlineLoading) loadOutline();
  };

  const courseDocs = allDocuments.filter((d) => course.documentIds.includes(d.id));
  const availableDocs = allDocuments.filter((d) => !course.documentIds.includes(d.id));

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'documents', label: 'Documents', count: courseDocs.length },
    ...(hasCoursera ? ([
      { id: 'lectures', label: 'Lectures', count: outline ? items.filter((i) => (TYPE_TAB[i.type] ?? 'lectures') === 'lectures').length : undefined },
      { id: 'labs', label: 'Labs', count: outline ? items.filter((i) => TYPE_TAB[i.type] === 'labs').length : undefined },
      { id: 'assignments', label: 'Assignments', count: outline ? items.filter((i) => TYPE_TAB[i.type] === 'assignments').length : undefined },
    ] as { id: Tab; label: string; count?: number }[]) : []),
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-400 hover:text-cyan-400 transition-colors text-sm"
        >
          <HiArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>

      {/* Course info */}
      <div className="min-w-0">
        <div className="card-kicker" style={{ fontSize: 12 }}>Course</div>
        <h1 style={{ fontSize: 32, margin: 'var(--space-1) 0 var(--space-1)', color: 'var(--color-text)' }}>
          {course.name}
        </h1>
        {course.description && (
          <p style={{ fontSize: 15, opacity: 0.6, margin: 0 }}>{course.description}</p>
        )}
      </div>

      {/* Study actions */}
      <div>
        <div className="section-label" style={{ marginBottom: 'var(--space-3)' }}>Study</div>
        <div className="flex flex-wrap" style={{ gap: 'var(--space-3)' }}>
          <button className="btn btn-primary" onClick={() => navigate('/flashcards')}>
            Flashcards
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/study-guides')}>
            Study guides
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/tests')}>
            Practice tests
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 border-b border-slate-700/50 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => openTab(t.id)}
            className={`px-3.5 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              tab === t.id
                ? 'text-cyan-400 border-cyan-400'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {tab === 'documents' ? (
        <div>
          <div className="flex items-center justify-end mb-4">
            {availableDocs.length > 0 && (
              <button
                onClick={() => setShowAddDocs(!showAddDocs)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 rounded-lg text-xs font-medium transition-colors border border-cyan-500/30"
              >
                {showAddDocs ? <HiChevronUp className="w-3.5 h-3.5" /> : <HiPlus className="w-3.5 h-3.5" />}
                {showAddDocs ? 'Hide' : 'Add Documents'}
              </button>
            )}
          </div>

          {/* Add documents dropdown */}
          {showAddDocs && availableDocs.length > 0 && (
            <div className="mb-4 bg-slate-900/50 border border-slate-700/50 rounded-xl p-3 max-h-64 overflow-y-auto">
              <p className="text-xs text-slate-500 mb-2 px-1">Click a document to add it to this course</p>
              <div className="space-y-1">
                {availableDocs.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => onAddDoc(course.id, doc.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                  >
                    <HiDocumentText className="w-4 h-4 text-slate-500 shrink-0" />
                    <span className="truncate">{doc.name}</span>
                    <HiPlus className="w-3.5 h-3.5 text-cyan-500 ml-auto shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Course documents list */}
          {courseDocs.length === 0 ? (
            <EmptyState
              icon="📄"
              title="No documents in this course"
              description="Add documents to this course to organize your study materials"
            />
          ) : (
            <div className="space-y-2">
              {courseDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl hover:bg-slate-800/80 transition-colors"
                >
                  <HiDocumentText className="w-5 h-5 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{doc.name}</p>
                    <p className="text-xs text-slate-500">{doc.type.toUpperCase()}</p>
                  </div>
                  <button
                    onClick={() => onRemoveDoc(course.id, doc.id)}
                    className="text-slate-500 hover:text-red-400 transition-colors p-1"
                    aria-label="Remove document"
                  >
                    <HiX className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          {outlineLoading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : outlineError ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-red-400">{outlineError}</p>
              <button onClick={() => loadOutline(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 rounded-lg text-xs font-medium border border-cyan-500/30">
                <HiRefresh className="w-3.5 h-3.5" /> Retry
              </button>
            </div>
          ) : outline ? (
            <CourseraItems slug={course.courseraSlug!} items={items.filter((i) => (TYPE_TAB[i.type] ?? 'lectures') === tab)} />
          ) : null}
        </div>
      )}
    </div>
  );
}
