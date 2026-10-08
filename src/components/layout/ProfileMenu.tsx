import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
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

function ActionRow({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" className={itemStyle} onClick={onClick}>
      <span className="shrink-0" style={{ color: 'var(--color-accent)' }}>{icon}</span>
      {label}
    </button>
  );
}

/** Real <a href> so middle-click / Cmd+click open in a new tab (browsers only do this for anchors). */
function NavRow({ icon, label, to, onNavigate }: { icon: ReactNode; label: string; to: string; onNavigate: () => void }) {
  return (
    <Link to={to} className={itemStyle} onClick={onNavigate}>
      <span className="shrink-0" style={{ color: 'var(--color-accent)' }}>{icon}</span>
      {label}
    </Link>
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
          {([
            ['Search documents', <HiMagnifyingGlass className="h-4.5 w-4.5" />, '/documents'],
            ['Learn', <HiAcademicCap className="h-4.5 w-4.5" />, HOME],
          ] as [string, ReactNode, string][]).map(([label, icon, to]) => (
            <NavRow
              key={to}
              icon={icon}
              label={label}
              to={to}
              onNavigate={() => setOpen(false)}
            />
          ))}

          <div style={{ borderTop: '1px solid var(--color-divider)' }} />
          <NavRow
            icon={<HiUser className="h-4.5 w-4.5" />}
            label="Settings"
            to="/settings"
            onNavigate={() => setOpen(false)}
          />
          <ActionRow
            icon={theme === 'dark' ? <HiSun className="h-4.5 w-4.5" /> : <HiMoon className="h-4.5 w-4.5" />}
            label={`Theme · ${theme === 'dark' ? 'light' : 'dark'} mode`}
            onClick={toggleTheme}
          />
          {u?.isAnonymous && (
            <ActionRow
              icon={<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/>
              </svg>}
              label="Sign in with Google"
              onClick={() => { window.location.href = '/api/auth/google/start'; }}
            />
          )}
          {u && (
            <ActionRow
              icon={<HiArrowRightOnRectangle className="h-4.5 w-4.5" />}
              label={u.isAnonymous ? 'Exit guest mode' : 'Log out'}
              onClick={() => void logout()}
            />
          )}
        </div>
      )}
    </div>
  );
}
