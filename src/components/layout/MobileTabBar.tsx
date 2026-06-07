import { useNavigate, useLocation } from 'react-router-dom';
import { HiHome, HiDocumentText, HiViewColumns, HiQuestionMarkCircle, HiBars3 } from 'react-icons/hi2';
import { useUIStore } from '../../store/uiStore';

const tabs = [
  { key: 'dashboard', label: 'Home', icon: HiHome, path: '/' },
  { key: 'documents', label: 'Docs', icon: HiDocumentText, path: '/documents' },
  { key: 'flashcards', label: 'Cards', icon: HiViewColumns, path: '/flashcards' },
  { key: 'quiz', label: 'Quiz', icon: HiQuestionMarkCircle, path: '/quiz' },
] as const;

export default function MobileTabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const toggleMobileDrawer = useUIStore((s) => s.toggleMobileDrawer);
  const setMobileActiveTab = useUIStore((s) => s.setMobileActiveTab);

  const activeKey = (() => {
    const path = location.pathname;
    if (path === '/') return 'dashboard';
    if (path.startsWith('/documents')) return 'documents';
    if (path.startsWith('/flashcards')) return 'flashcards';
    if (path.startsWith('/quiz')) return 'quiz';
    return '';
  })();

  const handleTabClick = (tab: (typeof tabs)[number]) => {
    setMobileActiveTab(tab.key);
    navigate(tab.path);
  };

  const handleMoreClick = () => {
    toggleMobileDrawer();
  };

  return (
    <nav
      className="
        fixed bottom-0 inset-x-0 z-50
        h-16
        bg-slate-900/95 backdrop-blur-lg
        border-t border-slate-700/50
        pb-[env(safe-area-inset-bottom)]
      "
    >
      <div className="flex items-center justify-around h-full">
        {tabs.map((tab) => {
          const isActive = activeKey === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabClick(tab)}
              className={`
                flex flex-col items-center justify-center
                min-w-[44px] min-h-[44px]
                transition-colors
                ${isActive ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'}
              `}
            >
              <Icon className="text-xl" />
              <span className="text-[10px] mt-0.5 leading-none">{tab.label}</span>
            </button>
          );
        })}

        {/* More button */}
        <button
          type="button"
          onClick={handleMoreClick}
          className="
            flex flex-col items-center justify-center
            min-w-[44px] min-h-[44px]
            text-slate-400 hover:text-slate-200
            transition-colors
          "
        >
          <HiBars3 className="text-xl" />
          <span className="text-[10px] mt-0.5 leading-none">More</span>
        </button>
      </div>
    </nav>
  );
}
