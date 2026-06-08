import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useUIStore } from '../../store/uiStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import MobileTabBar from './MobileTabBar';
import MobileDrawer from './MobileDrawer';
import MobileHeader from './MobileHeader';
import GlobalChat from '../chat/GlobalChat';

export default function Layout() {
  const { sidebarOpen } = useUIStore();
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
        <MobileHeader />
        <MobileDrawer />
        <main className="p-6 pb-20 ml-0">
          <Outlet />
        </main>
        <MobileTabBar />
        <GlobalChat />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
      <Sidebar />
      <div className={`transition-all duration-300 ${sidebarOpen ? 'ml-56' : 'ml-16'}`}>
        <Header />
        <main className="p-6">
          <Outlet />
        </main>
      </div>
      <GlobalChat />
    </div>
  );
}
