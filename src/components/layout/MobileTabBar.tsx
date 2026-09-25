import { useNavigate, useLocation } from 'react-router-dom';
import { HiRocketLaunch, HiDocumentText, HiBars3, HiChatBubbleLeftRight } from 'react-icons/hi2';
import { useUIStore } from '../../store/uiStore';
import { useChatStore } from '../../store/chatStore';
import { HOME } from '../../config/home';

const tabs = [
  { key: 'learn', label: 'Home', icon: HiRocketLaunch, path: HOME },
  { key: 'documents', label: 'Docs', icon: HiDocumentText, path: '/documents' },
] as const;

export default function MobileTabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const toggleMobileDrawer = useUIStore((s) => s.toggleMobileDrawer);
  const setMobileActiveTab = useUIStore((s) => s.setMobileActiveTab);
  const chatOpen = useChatStore((s) => s.isOpen);
  const toggleChat = useChatStore((s) => s.toggle);

  const activeKey = (() => {
    const path = location.pathname;
    if (path === HOME || path.startsWith('/learn')) return 'learn';
    if (path.startsWith('/documents')) return 'documents';
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
        pb-[env(safe-area-inset-bottom)]
      "
      style={{
        background: 'var(--color-surface)',
        borderTop: '1px solid var(--color-divider)',
      }}
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
                ${isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-neutral-600)] hover:text-[var(--color-text)]'}
              `}
            >
              <Icon className="text-xl" />
              <span className="text-[10px] mt-0.5 leading-none">{tab.label}</span>
            </button>
          );
        })}

        {/* Chat toggle */}
        <button
          type="button"
          onClick={toggleChat}
          className={`
            flex flex-col items-center justify-center
            min-w-[44px] min-h-[44px]
            transition-colors
            ${chatOpen ? 'text-[var(--color-accent)]' : 'text-[var(--color-neutral-600)] hover:text-[var(--color-text)]'}
          `}
        >
          <HiChatBubbleLeftRight className="text-xl" />
          <span className="text-[10px] mt-0.5 leading-none">Chat</span>
        </button>

        {/* More button */}
        <button
          type="button"
          onClick={handleMoreClick}
          className="
            flex flex-col items-center justify-center
            min-w-[44px] min-h-[44px]
            text-[var(--color-neutral-600)] hover:text-[var(--color-text)]
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
