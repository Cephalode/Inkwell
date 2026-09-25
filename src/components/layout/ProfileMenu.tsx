import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiUser,
  HiArrowRightOnRectangle,
  HiSun,
  HiMoon,
  HiAcademicCap,
  HiMagnifyingGlass,
} from 'react-icons/hi2';
import { useTheme } from '../../hooks/useTheme';
import { useAuthStore, type AuthUser } from '../../store/authStore';
import { HOME } from '../../config/home';

const itemStyle = 'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]';

function Row({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" className={itemStyle} onClick={onClick}>
      <span className="shrink-0" style={{ color: 'var(--color-accent)' }}>{icon}</span>
      {label}
    </button>
  );
}

function initials(name: string | null, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] + (parts[1]?.[0] ?? '')).toUpperCase() || 'I';
}

/** Turbo.ai-style account menu, top right. Home for Settings + Theme + Sign out,
 *  plus global search and the full page nav (replaces the deleted rail). */
export default function ProfileMenu() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const u: AuthUser | null = user;
  const initial = initials(u?.name ?? null, u?.email ?? 'Inkwell');

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
        style={{ background: 'var(--color-accent)', color: 'var(--color-bg)' }}
      >
        {u?.picture ? <img src={u.picture} alt="" className="h-full w-full object-cover" /> : initial}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-divider)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {/* Identity block (mirrors turbo.ai: name + email, greyed when absent) */}
          <div className="px-4 pb-3 pt-3.5">
            <div className="truncate text-sm font-bold">{u?.name || 'Guest'}</div>
            <div className="truncate text-xs" style={{ opacity: 0.55 }}>
              {u?.email || 'not signed in'}
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--color-divider)' }} />

          {/* Global pages — the rail's job, now living here */}
          {[
            ['Search documents', <HiMagnifyingGlass className="h-4.5 w-4.5" />, '/documents'],
            ['Learn', <HiAcademicCap className="h-4.5 w-4.5" />, HOME],
          ].map(([label, icon, to]) => (
            <Row
              key={to as string}
              icon={icon as ReactNode}
              label={label as string}
              onClick={() => {
                setOpen(false);
                navigate(to as string);
              }}
            />
          ))}

          <div style={{ borderTop: '1px solid var(--color-divider)' }} />
          <Row
            icon={<HiUser className="h-4.5 w-4.5" />}
            label="Settings"
            onClick={() => {
              setOpen(false);
              navigate('/settings');
            }}
          />
          <Row
            icon={theme === 'dark' ? <HiSun className="h-4.5 w-4.5" /> : <HiMoon className="h-4.5 w-4.5" />}
            label={`Theme · ${theme === 'dark' ? 'light' : 'dark'} mode`}
            onClick={toggleTheme}
          />
          {u && (
            <Row
              icon={<HiArrowRightOnRectangle className="h-4.5 w-4.5" />}
              label="Log out"
              onClick={() => void logout()}
            />
          )}
        </div>
      )}
    </div>
  );
}
