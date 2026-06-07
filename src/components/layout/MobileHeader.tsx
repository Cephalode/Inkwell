import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  HiAcademicCap,
  HiMagnifyingGlass,
  HiSun,
  HiMoon,
  HiXMark,
} from 'react-icons/hi2';
import { useTheme } from '../../hooks/useTheme';

const pathTitleMap: Record<string, string> = {
  '/': 'Dashboard',
  '/documents': 'Documents',
  '/courses': 'Courses',
  '/flashcards': 'Flashcards',
  '/quiz': 'Quiz',
  '/textbook': 'Textbook',
  '/study-guide': 'Study Guide',
  '/mindmap': 'Mind Map',
  '/pomodoro': 'Pomodoro',
  '/tutor': 'AI Tutor',
  '/notes': 'Notes',
  '/concepts': 'Concepts',
  '/exam': 'Practice Exam',
  '/schedule': 'Schedule',
  '/settings': 'Settings',
};

function getPageTitle(pathname: string): string {
  if (pathTitleMap[pathname]) return pathTitleMap[pathname];
  // Try matching prefix for nested routes
  const match = Object.entries(pathTitleMap).find(
    ([path]) => path !== '/' && pathname.startsWith(path)
  );
  return match ? match[1] : 'Inkwell';
}

export default function MobileHeader() {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const pageTitle = getPageTitle(location.pathname);

  return (
    <>
      {/* Top bar */}
      <header className="sticky top-0 z-40 h-14 bg-slate-900/95 backdrop-blur-lg border-b border-slate-700/50 flex items-center px-3 gap-2">
        {/* Left: Brand */}
        <div className="flex items-center gap-1.5 shrink-0">
          <HiAcademicCap className="w-6 h-6 text-cyan-400" />
          <span className="text-base font-bold text-cyan-400">Inkwell</span>
        </div>

        {/* Center: Page title */}
        <div className="flex-1 text-center">
          <span className="text-sm font-medium text-slate-300 truncate block">
            {pageTitle}
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setSearchOpen((prev) => !prev)}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
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
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
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
            className="overflow-hidden bg-slate-900/95 border-b border-slate-700/50"
          >
            <div className="px-3 py-2">
              <div className="relative">
                <HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search documents, flashcards..."
                  autoFocus
                  className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
