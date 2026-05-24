import { create } from 'zustand';

export type PomodoroPhase = 'work' | 'break' | 'longBreak';

interface PomodoroState {
  isRunning: boolean;
  phase: PomodoroPhase;
  timeRemaining: number;
  sessionsCompleted: number;
  start: () => void;
  pause: () => void;
  reset: () => void;
  tick: () => void;
  setPhase: (phase: PomodoroPhase) => void;
  setTimeRemaining: (seconds: number) => void;
  completeSession: () => void;
}

export const usePomodoroStore = create<PomodoroState>()((set) => ({
  isRunning: false,
  phase: 'work',
  timeRemaining: 25 * 60,
  sessionsCompleted: 0,
  start: () => set({ isRunning: true }),
  pause: () => set({ isRunning: false }),
  reset: () => set({ isRunning: false, timeRemaining: 25 * 60, phase: 'work' }),
  tick: () => set((s) => ({ timeRemaining: Math.max(0, s.timeRemaining - 1) })),
  setPhase: (phase) => set({ phase }),
  setTimeRemaining: (seconds) => set({ timeRemaining: seconds }),
  completeSession: () => set((s) => ({
    sessionsCompleted: s.sessionsCompleted + 1,
    isRunning: false,
  })),
}));
