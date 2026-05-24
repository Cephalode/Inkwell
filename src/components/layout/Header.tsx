import { HiMenu, HiSun, HiMoon, HiSearch } from 'react-icons/hi';
import { useUIStore } from '../../store/uiStore';
import { useTheme } from '../../hooks/useTheme';

export default function Header() {
  const { toggleSidebar } = useUIStore();
  const { theme, toggleTheme } = useTheme();

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
            placeholder="Search documents, flashcards..."
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
          />
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
