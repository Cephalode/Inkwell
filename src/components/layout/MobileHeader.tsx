import { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { HiAcademicCap, HiMagnifyingGlass, HiSun, HiMoon, HiXMark } from 'react-icons/hi2';
import { useTheme } from '../../hooks/useTheme';
import { PATH_TITLES } from '../../config/navigation';
import { HOME } from '../../config/home';

export default function MobileHeader() {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Dynamic page title (course names resolved via PATH_TITLES + prefix match)
  const pageTitle = (() => {
    if (PATH_TITLES[location.pathname]) return PATH_TITLES[location.pathname];
    const courseMatch = location.pathname.match(/^\/courses\/(.+)$/);
    if (courseMatch) return 'Course';
    const match = Object.entries(PATH_TITLES).find(
      ([path]) => path !== '/' && location.pathname.startsWith(path)
    );
    return match ? match[1] : 'Inkwell';
  })();

  return (
    <>
      {/* Top bar */}
      <header
        className="sticky top-0 z-40 h-14 flex items-center px-3 gap-2"
        style={{
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-divider)',
        }}
      >
        {/* Left: Brand */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Link to={HOME} aria-label="Home" className="flex items-center gap-1.5">
            <HiAcademicCap className="w-6 h-6" style={{ color: 'var(--color-accent)' }} />
            <span className="text-base font-bold" style={{ color: 'var(--color-accent)' }}>Inkwell</span>
          </Link>
        </div>

        {/* Center: Page title */}
        <div className="flex-1 text-center min-w-0">
          <span className="text-sm font-medium truncate block" style={{ opacity: 0.75 }}>
            {pageTitle}
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setSearchOpen((prev) => !prev)}
            className="p-2 rounded-[var(--radius-md)] text-[var(--color-neutral-600)] hover:text-[var(--color-text)] hover:bg-[var(--color-neutral-200)] transition-colors"
            aria-label="Toggle search"
          >
            {searchOpen ? (
              <HiXMark className="w-5 h-5" />
            ) : (
              <HiMagnifyingGlass className="w-5 h-5" />
            )}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-[var(--radius-md)] text-[var(--color-neutral-600)] hover:text-[var(--color-text)] hover:bg-[var(--color-neutral-200)] transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <HiSun className="w-5 h-5" />
            ) : (
              <HiMoon className="w-5 h-5" />
            )}
          </button>
        </div>
      </header>

      {/* Expandable search bar */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
            style={{
              background: 'var(--color-surface)',
              borderBottom: '1px solid var(--color-divider)',
            }}
          >
            <div className="px-3 py-2">
              <div className="relative">
                <HiMagnifyingGlass
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                  style={{ color: 'var(--color-neutral-500)' }}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search documents..."
                  autoFocus
                  className="input"
                  style={{ paddingLeft: 36 }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
