import { NavLink } from 'react-router-dom';
import { HiHome, HiDocumentText, HiAcademicCap, HiQuestionMarkCircle, HiBookOpen, HiClock, HiCog, HiTemplate, HiSparkles, HiChat, HiLightBulb, HiBeaker, HiClipboardCheck, HiCalendar } from 'react-icons/hi';
import { useUIStore } from '../../store/uiStore';

const navItems = [
  { to: '/', icon: HiHome, label: 'Dashboard' },
  { to: '/documents', icon: HiDocumentText, label: 'Documents' },
  { to: '/flashcards', icon: HiAcademicCap, label: 'Flashcards' },
  { to: '/quiz', icon: HiQuestionMarkCircle, label: 'Quiz' },
  { to: '/textbook', icon: HiBookOpen, label: 'Textbook' },
  { to: '/study-guide', icon: HiTemplate, label: 'Study Guide' },
  { to: '/mindmap', icon: HiSparkles, label: 'Mind Map' },
  { to: '/pomodoro', icon: HiClock, label: 'Pomodoro' },
  { to: '/tutor', icon: HiLightBulb, label: 'AI Tutor' },
  { to: '/notes', icon: HiChat, label: 'Notes' },
  { to: '/concepts', icon: HiBeaker, label: 'Concepts' },
  { to: '/exam', icon: HiClipboardCheck, label: 'Practice Exam' },
  { to: '/schedule', icon: HiCalendar, label: 'Schedule' },
  { to: '/settings', icon: HiCog, label: 'Settings' },
];

export default function Sidebar() {
  const { sidebarOpen } = useUIStore();

  return (
    <aside className={`fixed left-0 top-0 h-full bg-slate-900/95 border-r border-slate-700/50 backdrop-blur-sm transition-all duration-300 z-40 ${sidebarOpen ? 'w-56' : 'w-16'}`}>
      <div className="flex items-center h-16 px-4 border-b border-slate-700/50">
        <div className="text-2xl">🧠</div>
        {sidebarOpen && <span className="ml-3 text-lg font-bold bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">StudyForge</span>}
      </div>
      <nav className="mt-4 space-y-1 px-2">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              } ${!sidebarOpen ? 'justify-center' : ''}`
            }
          >
            <Icon className="w-5 h-5 shrink-0" />
            {sidebarOpen && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
