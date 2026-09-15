import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate, NavLink, Link } from 'react-router-dom';
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
      <header
        className="sticky top-0 z-40 h-14 flex items-center px-3 gap-2"
        style={{
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-divider)',
        }}
      >
        {/* Left: Brand */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Link to="/" aria-label="Home" className="flex items-center gap-1.5">
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

        {/* Course Tabs */}
        <nav className="flex items-center gap-1 min-w-0 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }} aria-label="Courses">
          {courses.map((course) => (
            <NavLink
              key={course.id}
              to={`/courses/${course.id}`}
              className={({ isActive }) =>
                `px-2 py-0.5 rounded-[var(--radius-sm)] text-[11px] font-medium border whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)] border-[color-mix(in_srgb,var(--color-accent)_35%,transparent)]'
                    : 'bg-[var(--color-neutral-200)] text-[var(--color-neutral-600)] hover:text-[var(--color-text)] border-[var(--color-divider)]'
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
              className="px-2 py-0.5 rounded-[var(--radius-sm)] text-[11px] font-medium border bg-[var(--color-neutral-200)] text-[var(--color-neutral-600)] hover:text-[var(--color-text)] border-[var(--color-divider)] transition-colors"
            >
              <HiPlus className="w-3.5 h-3.5" />
            </button>

            {showCreateForm && (
              <div
                className="card absolute right-0 top-full mt-2 p-3 w-52 z-50"
                style={{ boxShadow: 'var(--shadow-md)' }}
              >
                <input
                  type="text"
                  placeholder="Course name..."
                  autoFocus
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                  }}
                  className="input text-sm"
                />
                <button
                  onClick={handleCreate}
                  className="btn btn-primary mt-2 w-full text-sm transition-colors"
                >
                  Create
                </button>
              </div>
            )}
          </div>
        </nav>

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
