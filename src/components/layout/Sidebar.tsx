import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from '../../config/navigation';
import { useUIStore } from '../../store/uiStore';
import InkwellLogo from '../shared/InkwellLogo';

export default function Sidebar() {
  const { sidebarOpen } = useUIStore();

  return (
    <aside className={`fixed left-0 top-0 h-full bg-slate-900/95 border-r border-slate-700/50 backdrop-blur-sm transition-all duration-300 z-40 ${sidebarOpen ? 'w-56' : 'w-16'}`}>
      <div className="flex items-center h-16 px-4 border-b border-slate-700/50">
        <InkwellLogo className="w-7 h-7 text-cyan-400" />
        {sidebarOpen && <span className="ml-3 text-lg font-bold bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">Inkwell</span>}
      </div>
      <nav className="mt-4 space-y-1 px-2">
        {NAV_ITEMS.map(({ path, icon: Icon, label }) => (
          <NavLink
            key={path}
            to={path}
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
