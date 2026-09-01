import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  sidebarOpen: boolean;
  activeModal: string | null;
  modalData: unknown;
  toggleSidebar: () => void;
  openModal: (modal: string, data?: unknown) => void;
  closeModal: () => void;
  mobileDrawerOpen: boolean;
  mobileActiveTab: string;
  toggleMobileDrawer: () => void;
  setMobileDrawerOpen: (open: boolean) => void;
  setMobileActiveTab: (tab: string) => void;
  /** Today-plan checked-off task ids (persisted; key = task id). */
  todayDone: Record<string, boolean>;
  setTodayDone: (id: string, done: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      activeModal: null,
      modalData: null,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      openModal: (modal, data) => set({ activeModal: modal, modalData: data }),
      closeModal: () => set({ activeModal: null, modalData: null }),
      mobileDrawerOpen: false,
      mobileActiveTab: 'dashboard',
      toggleMobileDrawer: () => set((s) => ({ mobileDrawerOpen: !s.mobileDrawerOpen })),
      setMobileDrawerOpen: (open) => set({ mobileDrawerOpen: open }),
      setMobileActiveTab: (tab) => set({ mobileActiveTab: tab }),
      todayDone: {},
      setTodayDone: (id, done) =>
        set((s) => ({ todayDone: { ...s.todayDone, [id]: done } })),
    }),
    {
      name: 'inkwell-ui',
      partialize: (s) => ({ todayDone: s.todayDone }),
    }
  )
);
