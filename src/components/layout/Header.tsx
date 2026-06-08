import { useState, useRef, useEffect } from 'react';
import { HiMenu, HiSun, HiMoon, HiSearch, HiPlus } from 'react-icons/hi';
import { NavLink, useNavigate } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import { useTheme } from '../../hooks/useTheme';
import { useCourses } from '../../hooks/useCourses';

export default function Header() {
  const { toggleSidebar } = useUIStore();
  const { theme, toggleTheme } = useTheme();
  const { courses, loadCourses, createCourse } = useCourses();
  const navigate = useNavigate();

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

  return (
    <header className="h-16 bg-slate-900/80 backdrop-blur-sm border-b border-slate-700/50 flex items-center px-4 gap-4 sticky top-0 z-30">
      <button onClick={toggleSidebar} className="text-slate-400 hover:text-white transition-colors">
        <HiMenu className="w-6 h-6" />
      </button>
      <div className="flex-1 max-w-md">
        <div className="relative">
          <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
          <input
            type="text"
            placeholder="Search documents..."
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
          />
        </div>
      </div>

      {/* Course Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-shrink-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {courses.map((course) => (
          <NavLink
            key={course.id}
            to={`/courses/${course.id}`}
            className={({ isActive }) =>
              `px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap transition-colors ${
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
            className="px-2 py-1 rounded-full text-xs font-medium border bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-700 transition-colors"
          >
            <HiPlus className="w-4 h-4" />
          </button>

          {showCreateForm && (
            <div className="absolute right-0 top-full mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-lg p-3 w-56 z-40">
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

      <button
        onClick={toggleTheme}
        className="text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-800"
      >
        {theme === 'dark' ? <HiSun className="w-5 h-5" /> : <HiMoon className="w-5 h-5" />}
      </button>
    </header>
  );
}
