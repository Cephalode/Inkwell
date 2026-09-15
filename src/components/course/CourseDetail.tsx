import { useState } from 'react';
import { HiArrowLeft, HiDocumentText, HiX, HiPlus, HiChevronUp, HiLockClosed, HiExternalLink, HiRefresh } from 'react-icons/hi';
import EmptyState from '../shared/EmptyState';
import Spinner from '../shared/Spinner';
import { Course } from '../../types/course';
import { DocumentFile } from '../../types/document';
import { getCourseOutline, type CourseraModule } from '../../services/api/coursera';
import { TYPE_ICON, TYPE_LABEL, TYPE_TAB } from '../coursera/typeMeta';
import CourseRoadmap from './CourseRoadmap';

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
          <h3 className="section-label mb-2" style={{ fontSize: 12 }}>{mod.moduleName}</h3>
          <div className="space-y-1.5">
            {mod.items.map((it) => {
              const Icon = TYPE_ICON[it.type] ?? HiDocumentText;
              return (
                <a key={it.itemId} href={it.url} target="_blank" rel="noreferrer"
                   className="card flex items-center gap-3 px-4 py-2.5 transition-colors group hover:border-[var(--color-accent)]">
                  <Icon
                    className="w-4 h-4 shrink-0"
                    style={{
                      color: it.type.includes('programming')
                        ? 'var(--color-accent-600)'
                        : it.type === 'lecture'
                          ? 'var(--color-accent)'
                          : 'var(--color-neutral-600)',
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{it.name}</p>
                    <p className="text-xs truncate" style={{ opacity: 0.5 }}>{it.lessonName}</p>
                  </div>
                  <span className="shrink-0 text-[11px] uppercase tracking-wide" style={{ opacity: 0.5 }}>{TYPE_LABEL[it.type] ?? it.type}</span>
                  {it.locked && <HiLockClosed className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--color-warning)' }} title="Locked" />}
                  <HiExternalLink className="w-3.5 h-3.5 shrink-0 transition-colors text-[var(--color-neutral-500)] group-hover:text-[var(--color-accent)]" />
                </a>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-xs" style={{ opacity: 0.45 }}>Opens on coursera.org/learn/{slug}</p>
    </div>
  );
}

export default function CourseDetail({ course, allDocuments, onBack, onRemoveDoc, onAddDoc }: CourseDetailProps) {
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
          className="flex items-center gap-1.5 transition-colors text-sm text-[var(--color-neutral-600)] hover:text-[var(--color-accent)]"
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

      {/* Roadmap — server-built learning path + up-next jump-in */}
      <CourseRoadmap course={course} />

      {/* Tabs */}
      <div className="flex items-center gap-1.5 border-b overflow-x-auto" style={{ borderColor: 'var(--color-divider)' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => openTab(t.id)}
            className={`px-3.5 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              tab === t.id
                ? 'text-[var(--color-accent)] border-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-neutral-600)] hover:text-[var(--color-text)]'
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
                className="btn btn-ghost"
                style={{ padding: '4px 10px', fontSize: 12, border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)' }}
              >
                {showAddDocs ? <HiChevronUp className="w-3.5 h-3.5" /> : <HiPlus className="w-3.5 h-3.5" />}
                {showAddDocs ? 'Hide' : 'Add Documents'}
              </button>
            )}
          </div>

          {/* Add documents dropdown */}
          {showAddDocs && availableDocs.length > 0 && (
            <div className="card mb-4 p-3 max-h-64 overflow-y-auto">
              <p className="text-xs mb-2 px-1" style={{ opacity: 0.5 }}>Click a document to add it to this course</p>
              <div className="space-y-1">
                {availableDocs.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => onAddDoc(course.id, doc.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
                    style={{ borderRadius: 'var(--radius-md)' }}
                  >
                    <HiDocumentText className="w-4 h-4 shrink-0" style={{ color: 'var(--color-neutral-600)' }} />
                    <span className="truncate">{doc.name}</span>
                    <HiPlus className="w-3.5 h-3.5 ml-auto shrink-0" style={{ color: 'var(--color-accent)' }} />
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
                  className="card flex items-center gap-3 px-4 py-3 transition-colors hover:border-[var(--color-accent)]"
                >
                  <HiDocumentText className="w-5 h-5 shrink-0" style={{ color: 'var(--color-neutral-600)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    <p className="text-xs" style={{ opacity: 0.5 }}>{doc.type.toUpperCase()}</p>
                  </div>
                  <button
                    onClick={() => onRemoveDoc(course.id, doc.id)}
                    className="transition-colors p-1 text-[var(--color-neutral-600)] hover:text-[var(--color-danger)]"
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
              <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{outlineError}</p>
              <button
                onClick={() => loadOutline(true)}
                className="btn btn-ghost"
                style={{ padding: '4px 10px', fontSize: 12, border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)' }}
              >
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
