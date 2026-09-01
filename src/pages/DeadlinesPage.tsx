import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDeadlineStore } from '../store/deadlineStore';
import { useCourseStore } from '../store/courseStore';
import type { Deadline } from '../types/deadlines';

const SERIF_HEADING = { fontFamily: "'Source Serif 4', Georgia, serif" } as const;

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Relative due label: Today / Tomorrow / In N days / date string. */
function dueLabel(dueAt: number, startToday: number): { text: string; tomorrow: boolean } {
  const days = Math.round((dueAt - startToday) / 86_400_000);
  if (days <= 0) return { text: 'Today', tomorrow: false };
  if (days === 1) return { text: 'Tomorrow', tomorrow: true };
  return { text: `In ${days} days`, tomorrow: false };
}

export default function DeadlinesPage() {
  const navigate = useNavigate();
  const deadlines = useDeadlineStore((s) => s.deadlines);
  const addDeadline = useDeadlineStore((s) => s.addDeadline);
  const removeDeadline = useDeadlineStore((s) => s.removeDeadline);
  const courses = useCourseStore((s) => s.courses);

  const [title, setTitle] = useState('');
  const [dueAtLocal, setDueAtLocal] = useState('');
  const [courseId, setCourseId] = useState('');

  const startToday = useMemo(() => startOfToday(), []);
  const weekEnd = startToday + 7 * 86_400_000;

  const courseName = (id?: string) => courses.find((c) => c.id === id)?.name;

  const sorted = useMemo(
    () => [...deadlines].sort((a, b) => a.dueAt - b.dueAt),
    [deadlines]
  );

  const groups: { label: string; items: Deadline[]; overdue?: boolean }[] = [
    { label: 'Overdue', items: sorted.filter((d) => d.dueAt < startToday), overdue: true },
    { label: 'This week', items: sorted.filter((d) => d.dueAt >= startToday && d.dueAt < weekEnd) },
    { label: 'Later', items: sorted.filter((d) => d.dueAt >= weekEnd) },
  ];

  const handleAdd = () => {
    const trimmed = title.trim();
    if (!trimmed || !dueAtLocal) return;
    const dueAt = new Date(dueAtLocal).getTime();
    addDeadline({
      title: trimmed,
      dueAt,
      courseId: courseId || undefined,
      source: courseId ? 'course' : 'manual',
    });
    setTitle('');
    setDueAtLocal('');
    setCourseId('');
  };

  const inputCls =
    'rounded-lg border bg-transparent px-3 py-2 text-sm ' +
    'border-[var(--color-border)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-700)]';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)]" style={SERIF_HEADING}>
        Deadlines
      </h1>

      {/* Add form */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Deadline title"
          className={`${inputCls} flex-1 min-w-[12rem]`}
        />
        <input
          type="datetime-local"
          value={dueAtLocal}
          onChange={(e) => setDueAtLocal(e.target.value)}
          className={inputCls}
        />
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={inputCls}>
          <option value="">No course</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!title.trim() || !dueAtLocal}
          className="rounded-lg px-4 py-2 text-sm font-medium bg-[var(--color-accent-700)] text-white disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {deadlines.length === 0 && (
        <p className="text-sm text-[var(--color-text-secondary)]">No deadlines yet — add one above.</p>
      )}

      {groups.map(
        (g) =>
          g.items.length > 0 && (
            <section key={g.label} className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                {g.label}
              </h2>
              <ul className="divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)]">
                {g.items.map((d) => {
                  const name = courseName(d.courseId);
                  const { text, tomorrow } = dueLabel(d.dueAt, startToday);
                  return (
                    <li
                      key={d.id}
                      onClick={() => d.courseId && navigate(`/courses/${d.courseId}`)}
                      className="flex items-center gap-3 px-4 py-3 text-sm"
                    >
                      <span className="flex-1 truncate text-[var(--color-text)]">{d.title}</span>
                      {name && (
                        <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-secondary)]">
                          {name}
                        </span>
                      )}
                      <span
                        className={
                          g.overdue
                            ? 'text-xs text-red-600'
                            : tomorrow
                              ? 'text-xs font-semibold text-[var(--color-accent-700)]'
                              : 'text-xs text-[var(--color-text-secondary)]'
                        }
                      >
                        {text}
                      </span>
                      <button
                        type="button"
                        aria-label={`Delete ${d.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeDeadline(d.id);
                        }}
                        className="text-[var(--color-text-secondary)] hover:text-red-600"
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )
      )}
    </div>
  );
}
