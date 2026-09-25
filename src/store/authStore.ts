import { create } from 'zustand';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  plan: string;
}

interface AuthState {
  user: AuthUser | null;
  authEnabled: boolean;
  loading: boolean;
  load: () => Promise<void>;
  logout: () => Promise<void>;
  /** E8: when auth is on and no session exists, silently create an anon one. */
  ensureSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  authEnabled: false,
  loading: true,
  load: async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      set({ user: data.user, authEnabled: data.authEnabled, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  logout: async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    set({ user: null });
    window.location.href = '/';
  },
  ensureSession: async () => {
    const { user, authEnabled } = get();
    if (!authEnabled || user) return;
    try {
      const res = await fetch('/api/auth/anon', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.user) set({ user: data.user });
      }
    } catch { /* anon bootstrap is best-effort */ }
  },
}));
