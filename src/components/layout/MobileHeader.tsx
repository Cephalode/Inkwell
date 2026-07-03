import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate, NavLink } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  HiAcademicCap,
  HiMagnifyingGlass,
  HiSun,
  HiMoon,
  HiXMark,
  HiPlus,
} from 'react-icons/hi2';
import { useTheme } from '../../hooks/useTheme';
import { useCourses } from '../../hooks/useCourses';
import { PATH_TITLES } from '../../config/navigation';

export default function MobileHeader() {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { courses, loadCourses, createCourse } = useCourses();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const createRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    if (!showCreateForm) return;
    function handleClickOutside(e: MouseEvent) {
      if (createRef.current && !createRef.current.contains(e.target as Node)) {
        setShowCreateForm(false);
        setNewCourseName('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCreateForm]);

  const handleCreate = async () => {
    const name = newCourseName.trim();
    if (!name) return;
    const course = await createCourse(name);
    setShowCreateForm(false);
    setNewCourseName('');
    navigate(`/courses/${course.id}`);
  };

  // Dynamic page title with course name lookup
  const pageTitle = (() => {
    if (PATH_TITLES[location.pathname]) return PATH_TITLES[location.pathname];
    // Match /courses/:id and look up course name
    const courseMatch = location.pathname.match(/^\/courses\/(.+)$/);
    if (courseMatch) {
      const courseId = courseMatch[1];
      const course = courses.find((c) => c.id === courseId);
      if (course) return course.name;
      return 'Course';
    }
    // Try matching prefix for other nested routes
    const match = Object.entries(PATH_TITLES).find(
      ([path]) => path !== '/' && location.pathname.startsWith(path)
    );
    return match ? match[1] : 'Inkwell';
  })();

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
        <div className="flex-1 text-center min-w-0">
          <span className="text-sm font-medium text-slate-300 truncate block">
            {pageTitle}
          </span>
        </div>

        {/* Course Tabs */}
        <div className="flex items-center gap-1 flex-shrink-0 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {courses.map((course) => (
            <NavLink
              key={course.id}
              to={`/courses/${course.id}`}
              className={({ isActive }) =>
                `px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-cyan-600/20 text-cyan-400 border-cyan-500/30'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-700'
                }`
              }
            >
              {course.name}
            </NavLink>
          ))}

          {/* Create Course Button + Dropdown */}
          <div className="relative" ref={createRef}>
            <button
              onClick={() => setShowCreateForm((v) => !v)}
              className="px-2 py-0.5 rounded-full text-[11px] font-medium border bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-700 transition-colors"
            >
              <HiPlus className="w-3.5 h-3.5" />
            </button>

            {showCreateForm && (
              <div className="absolute right-0 top-full mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-lg p-3 w-52 z-50">
                <input
                  type="text"
                  placeholder="Course name..."
                  autoFocus
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                  }}
                  className="w-full pl-3 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
                />
                <button
                  onClick={handleCreate}
                  className="mt-2 w-full bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm px-3 py-1.5 transition-colors"
                >
                  Create
                </button>
              </div>
            )}
          </div>
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
                  placeholder="Search documents..."
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
