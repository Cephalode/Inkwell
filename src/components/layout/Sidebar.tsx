import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  PiHouseDuotone,
  PiMagnifyingGlassDuotone,
  PiPlusBold,
  PiFilesDuotone,
  PiGearDuotone,
  PiMoonDuotone,
  PiSunDuotone,
} from 'react-icons/pi';
import { useUIStore } from '../../store/uiStore';
import { useTheme } from '../../hooks/useTheme';
import { useCourses } from '../../hooks/useCourses';

const ABBR_STOPWORDS = new Set(['introduction', 'intro', 'to', 'the', 'a', 'an', 'of', 'and', 'for', 'in']);

/** Short course label for the rail circle. Lead-in words are skipped and a
 *  post-colon qualifier disambiguates, so "Introduction to Deep Learning" → "DL",
 *  "Introduction to Machine Learning: Supervised Learning" → "MS",
 *  "Organic Chemistry I" → "OC", "Bio 201" → "Bi". */
function courseAbbr(name: string): string {
  const significant = (s: string) =>
    s
      .trim()
      .split(/\s+/)
      .filter((w) => /^[A-Za-z]/.test(w) && !ABBR_STOPWORDS.has(w.toLowerCase().replace(/[^a-z]/g, '')));
  const [head, qualifier] = name.split(/[:—–-]/, 2);
  const words = significant(head);
  const qualWords = qualifier ? significant(qualifier) : [];
  if (words.length >= 1 && qualWords.length >= 1) return (words[0][0] + qualWords[0][0]).toUpperCase();
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const w = words[0] ?? name.trim();
  return w.slice(0, 2);
}

function RailButton({
  title,
  active = false,
  onClick,
  children,
  style,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex items-center justify-center shrink-0 cursor-pointer transition-colors"
      style={{
        width: 38,
        height: 38,
        borderRadius: '50%',
        border: 'none',
        font: '600 13px var(--font-body)',
        background: active ? 'var(--color-text)' : 'transparent',
        color: active ? 'var(--color-bg)' : 'var(--color-text)',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/** Icon rail — the Study Desk prototype's left navigation. */
export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { openModal } = useUIStore();
  const { courses, loadCourses } = useCourses();

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const activeCourseId = location.pathname.startsWith('/courses/')
    ? location.pathname.split('/')[2]
    : null;

  return (
    <aside
      className="fixed left-0 top-0 z-40 flex h-full w-16 flex-col items-center overflow-y-auto"
      style={{
        background: 'var(--color-surface)',
        padding: 'var(--space-4) 0',
        gap: 'var(--space-3)',
      }}
    >
      <RailButton title="Home" active={location.pathname === '/'} onClick={() => navigate('/')}>
        <PiHouseDuotone size={19} />
      </RailButton>
      <RailButton title="Search — ⌘K" onClick={() => openModal('command-palette')}>
        <PiMagnifyingGlassDuotone size={19} />
      </RailButton>

      {courses.map((c) => (
        <RailButton
          key={c.id}
          title={c.name}
          onClick={() => navigate(`/courses/${c.id}`)}
          style={{
            background: activeCourseId === c.id ? 'var(--color-accent)' : 'var(--color-neutral-300)',
            color: activeCourseId === c.id ? '#fff' : 'var(--color-text)',
          }}
        >
          {courseAbbr(c.name)}
        </RailButton>
      ))}

      <RailButton
        title="New course"
        onClick={() => navigate('/courses')}
        style={{ border: '1px dashed var(--color-neutral-500)', color: 'var(--color-neutral-700)' }}
      >
        <PiPlusBold size={15} />
      </RailButton>

      <RailButton
        title="All materials"
        active={location.pathname.startsWith('/documents')}
        onClick={() => navigate('/documents')}
        style={{ marginTop: 'auto' }}
      >
        <PiFilesDuotone size={19} />
      </RailButton>
      <RailButton
        title="Settings"
        active={location.pathname.startsWith('/settings')}
        onClick={() => navigate('/settings')}
      >
        <PiGearDuotone size={19} />
      </RailButton>
      <RailButton
        title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        onClick={toggleTheme}
        style={{ color: 'var(--color-neutral-700)' }}
      >
        {theme === 'dark' ? <PiSunDuotone size={19} /> : <PiMoonDuotone size={19} />}
      </RailButton>
    </aside>
  );
}
