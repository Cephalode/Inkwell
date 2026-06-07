import { create } from 'zustand';

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
}

export const useUIStore = create<UIState>()((set) => ({
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
}));
