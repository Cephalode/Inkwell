import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  HiHome,
  HiDocumentText,
  HiAcademicCap,
  HiQuestionMarkCircle,
  HiBookOpen,
  HiClock,
  HiCog,
  HiSquare3Stack3D,
  HiSparkles,
  HiChatBubbleLeftRight,
  HiLightBulb,
  HiBeaker,
  HiClipboardDocumentCheck,
  HiCalendar,
  HiXMark,
} from 'react-icons/hi2';
import { useUIStore } from '../../store/uiStore';

const navItems = [
  { to: '/', icon: HiHome, label: 'Dashboard' },
  { to: '/documents', icon: HiDocumentText, label: 'Documents' },
  { to: '/courses', icon: HiBookOpen, label: 'Courses' },
  { to: '/flashcards', icon: HiAcademicCap, label: 'Flashcards' },
  { to: '/quiz', icon: HiQuestionMarkCircle, label: 'Quiz' },
  { to: '/textbook', icon: HiBookOpen, label: 'Textbook' },
  { to: '/study-guide', icon: HiSquare3Stack3D, label: 'Study Guide' },
  { to: '/mindmap', icon: HiSparkles, label: 'Mind Map' },
  { to: '/pomodoro', icon: HiClock, label: 'Pomodoro' },
  { to: '/tutor', icon: HiLightBulb, label: 'AI Tutor' },
  { to: '/notes', icon: HiChatBubbleLeftRight, label: 'Notes' },
  { to: '/concepts', icon: HiBeaker, label: 'Concepts' },
  { to: '/exam', icon: HiClipboardDocumentCheck, label: 'Practice Exam' },
  { to: '/schedule', icon: HiCalendar, label: 'Schedule' },
  { to: '/settings', icon: HiCog, label: 'Settings' },
];

export default function MobileDrawer() {
  const { mobileDrawerOpen, setMobileDrawerOpen } = useUIStore();
  const navigate = useNavigate();
  const location = useLocation();

  const closeDrawer = () => setMobileDrawerOpen(false);

  const handleNavClick = (to: string) => {
    navigate(to);
    closeDrawer();
  };

  return (
    <AnimatePresence>
      {mobileDrawerOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/50 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeDrawer}
          />

          {/* Drawer panel */}
          <motion.div
            className="fixed left-0 top-0 h-full w-72 bg-slate-900 border-r border-slate-700/50 z-50 flex flex-col"
            initial={{ x: -288 }}
            animate={{ x: 0 }}
            exit={{ x: -288 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between h-16 px-4 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🧠</span>
                <span className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">
                  Inkwell
                </span>
              </div>
              <button
                onClick={closeDrawer}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <HiXMark className="w-6 h-6" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="mt-4 space-y-1 px-2 overflow-y-auto flex-1">
              {navItems.map(({ to, icon: Icon, label }) => {
                const isActive = location.pathname === to;
                return (
                  <button
                    key={to}
                    onClick={() => handleNavClick(to)}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </nav>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
