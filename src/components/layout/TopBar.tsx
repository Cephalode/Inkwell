import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { HiDocumentText, HiMagnifyingGlass } from 'react-icons/hi2';
import { PiLightningDuotone } from 'react-icons/pi';
import InkwellLogo from '../shared/InkwellLogo';
import ProfileMenu from './ProfileMenu';

interface ApiDoc {
  id: string;
  name: string;
  type: string;
  tags?: string[] | null;
}

interface ApiLesson {
  id: string;
  title: string;
  status: string;
  percent_completed?: number | null;
  document_name?: string | null;
}

/** Desktop top bar — brand, unified search (lessons + documents), account.
 *  No drawer: the left sidebar is gone; ⌘K palette covers the rest of nav. */
export default function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState<ApiDoc[] | null>(null);
  const [lessons, setLessons] = useState<ApiLesson[] | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const onDocuments = location.pathname.startsWith('/documents');

  // Lazily load the search corpus the first time the user focuses the bar.
  const ensureCorpus = () => {
    if (docs === null) {
      fetch('/api/documents')
        .then((r) => r.json())
        .then((d: ApiDoc[]) => setDocs(Array.isArray(d) ? d : []))
        .catch(() => setDocs([]));
    }
    if (lessons === null) {
      fetch('/api/lessons')
        .then((r) => r.json())
        .then((l: ApiLesson[]) => setLessons(Array.isArray(l) ? l : []))
        .catch(() => setLessons([]));
    }
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const q = search.trim().toLowerCase();
  const docHits = useMemo(
    () =>
      q && docs
        ? docs
            .filter(
              (d) =>
                d.name?.toLowerCase().includes(q) ||
                (d.tags ?? []).some((t) => t?.toLowerCase().includes(q))
            )
            .slice(0, 6)
        : [],
    [q, docs]
  );
  const lessonHits = useMemo(
    () =>
      q && lessons
        ? lessons
            .filter(
              (l) =>
                l.title?.toLowerCase().includes(q) ||
                (l.document_name ?? '').toLowerCase().includes(q)
            )
            .slice(0, 6)
        : [],
    [q, lessons]
  );
  const firstHit = lessonHits[0] ?? docHits[0];

  const goDoc = (id: string) => {
    setOpen(false);
    setSearch('');
    navigate(`/documents/${id}`);
  };
  const goLesson = (id: string) => {
    setOpen(false);
    setSearch('');
    navigate(`/lessons/${id}`);
  };
  const goAllDocs = () => {
    setOpen(false);
    navigate(`/documents?q=${encodeURIComponent(search.trim())}`);
  };

  const showResults = open && q.length > 0;

  return (
    <header
      className="sticky top-0 z-40 flex h-14 items-center gap-3 px-4"
      style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-divider)' }}
    >
      {/* Brand */}
      <button
        type="button"
        onClick={() => navigate('/')}
        className="flex cursor-pointer items-center gap-2 text-sm font-bold"
        style={{ color: 'var(--color-accent)' }}
      >
        <InkwellLogo className="h-5 w-5" />
        Inkwell
      </button>

      {/* Unified search: lessons + documents */}
      <div className="relative min-w-0 flex-1" style={{ maxWidth: 420 }} ref={boxRef}>
        <HiMagnifyingGlass
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ color: 'var(--color-neutral-500)' }}
        />
        <input
          type="search"
          placeholder="Search lessons or documents"
          aria-label="Search lessons or documents"
          value={search}
          onFocus={() => {
            setOpen(true);
            ensureCorpus();
          }}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
            ensureCorpus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && q) {
              if (firstHit) {
                if ('status' in firstHit) goLesson((firstHit as ApiLesson).id);
                else goDoc((firstHit as ApiDoc).id);
              } else {
                goAllDocs();
              }
            }
          }}
          className="input"
          style={{ paddingLeft: 36 }}
        />

        {showResults && (
          <div
            className="card absolute left-0 right-0 top-full mt-1 z-50"
            style={{ maxHeight: 400, overflowY: 'auto' }}
            role="listbox"
            aria-label="Search results"
          >
            {lessonHits.length > 0 && (
              <div style={{ padding: '4px 0' }}>
                <div
                  className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--color-neutral-500)' }}
                >
                  Lessons
                </div>
                {lessonHits.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => goLesson(l.id)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-neutral-200)]"
                  >
                    <PiLightningDuotone className="h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
                    <span className="min-w-0 flex-1 truncate">{l.title}</span>
                    <span className="shrink-0 text-[10px]" style={{ color: 'var(--color-neutral-500)' }}>
                      {l.status === 'ready' && l.percent_completed != null ? `${Math.round(l.percent_completed)}%` : l.status}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {docHits.length > 0 && (
              <div style={{ padding: '4px 0' }}>
                <div
                  className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--color-neutral-500)' }}
                >
                  Documents
                </div>
                {docHits.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => goDoc(d.id)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-neutral-200)]"
                  >
                    <HiDocumentText className="h-4 w-4 shrink-0" style={{ color: 'var(--color-neutral-500)' }} />
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                    {(d.tags ?? []).length > 0 && (
                      <span className="shrink-0 text-[10px]" style={{ color: 'var(--color-neutral-500)' }}>
                        {(d.tags ?? []).slice(0, 2).join(', ')}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {lessonHits.length === 0 && docHits.length === 0 && (
              <div className="px-3 py-3 text-sm" style={{ color: 'var(--color-neutral-500)' }}>
                {docs === null || lessons === null ? 'Loading…' : 'No matches'}
              </div>
            )}

            {q && (docHits.length > 0 || lessonHits.length > 0) && (
              <button
                type="button"
                onClick={goAllDocs}
                className="block w-full border-t px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--color-neutral-200)]"
                style={{ borderColor: 'var(--color-divider)', color: 'var(--color-neutral-500)' }}
              >
                See all documents matching “{search.trim()}”
              </button>
            )}
          </div>
        )}
      </div>

      {/* Documents nav link */}
      <button
        type="button"
        onClick={() => navigate('/documents')}
        aria-current={onDocuments ? 'page' : undefined}
        className={`flex items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-sm font-medium transition-colors ${
          onDocuments
            ? 'bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)]'
            : 'text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-200)] hover:text-[var(--color-text)]'
        }`}
      >
        <HiDocumentText className="h-4 w-4" />
        Documents
      </button>

      <div className="flex-1" />
      <ProfileMenu />
    </header>
  );
}
