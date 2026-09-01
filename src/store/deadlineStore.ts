import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Deadline } from '../types/deadlines';

interface DeadlineState {
  deadlines: Deadline[];
  addDeadline: (d: Omit<Deadline, 'id'>) => void;
  removeDeadline: (id: string) => void;
  updateDeadline: (id: string, patch: Partial<Deadline>) => void;
}

export const useDeadlineStore = create<DeadlineState>()(
  persist(
    (set) => ({
      deadlines: [],

      addDeadline: (d) =>
        set((s) => ({
          deadlines: [...s.deadlines, { ...d, id: `dl_${Date.now()}` }],
        })),

      removeDeadline: (id) =>
        set((s) => ({ deadlines: s.deadlines.filter((d) => d.id !== id) })),

      updateDeadline: (id, patch) =>
        set((s) => ({
          deadlines: s.deadlines.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        })),
    }),
    { name: 'inkwell-deadlines' }
  )
);
