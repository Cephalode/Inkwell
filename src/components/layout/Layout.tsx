import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import { useIsMobile } from '../../hooks/useIsMobile';
import MobileTabBar from './MobileTabBar';
import MobileDrawer from './MobileDrawer';
import MobileHeader from './MobileHeader';
import GlobalChat from '../chat/GlobalChat';
import TTSOverlay from '../shared/TTSOverlay';
import CommandPalette from '../shared/CommandPalette';

/** One chrome for both: top bar (search + hamburger + account), drawer for
 *  full nav, tab bar on mobile. The icon rail is gone. Theatre mode does NOT
 *  unmount any of this — the video page's z-indexed overlay simply covers it
 *  (unmounting <main> would destroy the page below the overlay). */
export default function Layout() {
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
      {isMobile ? <MobileHeader /> : <TopBar />}
      <MobileDrawer />
      {!isMobile && <main className="p-6"><Outlet /></main>}
      {isMobile && <main className="p-6 pb-20"><Outlet /></main>}
      {isMobile && <MobileTabBar />}
      <CommandPalette />
      <GlobalChat />
      <TTSOverlay />
    </div>
  );
}
