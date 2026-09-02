import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useIsMobile } from '../../hooks/useIsMobile';
import MobileTabBar from './MobileTabBar';
import MobileDrawer from './MobileDrawer';
import MobileHeader from './MobileHeader';
import GlobalChat from '../chat/GlobalChat';
import TTSOverlay from '../shared/TTSOverlay';
import CommandPalette from '../shared/CommandPalette';

export default function Layout() {
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
        <TTSOverlay />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
      <Sidebar />
      <div className="ml-16">
        <main className="p-6">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
      <GlobalChat />
      <TTSOverlay />
    </div>
  );
}
