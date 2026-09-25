import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiMagnifyingGlass } from 'react-icons/hi2';
import { HiMenu } from 'react-icons/hi';
import { useUIStore } from '../../store/uiStore';
import InkwellLogo from '../shared/InkwellLogo';
import ProfileMenu from './ProfileMenu';

/** Desktop top bar — replaced the icon rail. Search, drawer toggle, account. */
export default function TopBar() {
  const { toggleMobileDrawer } = useUIStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  return (
    <header
      className="sticky top-0 z-40 flex h-14 items-center gap-3 px-4"
      style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-divider)' }}
    >
      <button
        type="button"
        onClick={toggleMobileDrawer}
        aria-label="Open menu"
        className="rounded-[var(--radius-md)] p-2 text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-200)] hover:text-[var(--color-text)]"
      >
        <HiMenu className="h-5 w-5" />
      </button>

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

      {/* Search */}
      <div className="relative min-w-0 flex-1" style={{ maxWidth: 420 }}>
        <HiMagnifyingGlass
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ color: 'var(--color-neutral-500)' }}
        />
        <input
          type="search"
          placeholder="Search documents..."
          aria-label="Search documents"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            navigate(`/documents${e.target.value ? `?q=${encodeURIComponent(e.target.value)}` : ''}`, { replace: true });
          }}
          className="input"
          style={{ paddingLeft: 36 }}
        />
      </div>

      <div className="flex-1" />
      <ProfileMenu />
    </header>
  );
}
