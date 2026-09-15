import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { HiXMark } from 'react-icons/hi2';
import { NAV_ITEMS } from '../../config/navigation';
import { useUIStore } from '../../store/uiStore';
import InkwellLogo from '../shared/InkwellLogo';

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
            className="fixed left-0 top-0 h-full w-72 z-50 flex flex-col"
            style={{
              background: 'var(--color-surface)',
              borderRight: '1px solid var(--color-divider)',
            }}
            initial={{ x: -288 }}
            animate={{ x: 0 }}
            exit={{ x: -288 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between h-16 px-4"
              style={{ borderBottom: '1px solid var(--color-divider)' }}
            >
              <div className="flex items-center gap-3">
                <InkwellLogo className="w-7 h-7 text-[var(--color-accent)]" />
                <span className="text-lg font-bold" style={{ color: 'var(--color-accent)' }}>
                  Inkwell
                </span>
              </div>
              <button
                onClick={closeDrawer}
                className="p-1.5 rounded-[var(--radius-md)] text-[var(--color-neutral-600)] hover:text-[var(--color-text)] hover:bg-[var(--color-neutral-200)] transition-colors"
              >
                <HiXMark className="w-6 h-6" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="mt-4 space-y-1 px-2 overflow-y-auto flex-1">
              {NAV_ITEMS.map(({ path, icon: Icon, label }) => {
                const isActive = location.pathname === path;
                return (
                  <button
                    key={path}
                    onClick={() => handleNavClick(path)}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-[var(--radius-md)] text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)] border border-[color-mix(in_srgb,var(--color-accent)_35%,transparent)]'
                        : 'text-[var(--color-neutral-600)] hover:text-[var(--color-text)] hover:bg-[var(--color-neutral-200)]'
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
