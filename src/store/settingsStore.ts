import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AppSettings, DEFAULT_SETTINGS, ThemeMode } from '../types/settings';

interface SettingsState {
  settings: AppSettings;
  setApiKey: (key: string) => void;
  setProvider: (provider: 'openai' | 'custom') => void;
  setBaseUrl: (url: string) => void;
  setModel: (model: string) => void;
  setTheme: (theme: ThemeMode) => void;
  setPomodoroWork: (min: number) => void;
  setPomodoroBreak: (min: number) => void;
  setPomodoroLongBreak: (min: number) => void;
  setDefaultSummaryType: (t: 'tldr' | 'keypoints' | 'detailed') => void;
  resetSettings: () => void;
}

const OLD_STORE_KEY = 'studyforge-settings';
const STORE_KEY = 'inkwell-settings';

// One-time migration: if new key doesn't exist but old key does, copy it over
function migrateSettingsStorage() {
  try {
    const newData = localStorage.getItem(STORE_KEY);
    const oldData = localStorage.getItem(OLD_STORE_KEY);
    if (!newData && oldData) {
      localStorage.setItem(STORE_KEY, oldData);
      localStorage.removeItem(OLD_STORE_KEY);
    }
  } catch { /* ignore */ }
}

// Run migration before store initialization
migrateSettingsStorage();

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      setApiKey: (key) => set((s) => ({ settings: { ...s.settings, ai: { ...s.settings.ai, apiKey: key } } })),
      setProvider: (provider) => set((s) => ({ settings: { ...s.settings, ai: { ...s.settings.ai, provider } } })),
      setBaseUrl: (url) => set((s) => ({ settings: { ...s.settings, ai: { ...s.settings.ai, baseUrl: url } } })),
      setModel: (model) => set((s) => ({ settings: { ...s.settings, ai: { ...s.settings.ai, model } } })),
      setTheme: (theme) => set((s) => {
        document.documentElement.className = theme;
        return { settings: { ...s.settings, theme } };
      }),
      setPomodoroWork: (min) => set((s) => ({ settings: { ...s.settings, pomodoro: { ...s.settings.pomodoro, workDuration: min } } })),
      setPomodoroBreak: (min) => set((s) => ({ settings: { ...s.settings, pomodoro: { ...s.settings.pomodoro, breakDuration: min } } })),
      setPomodoroLongBreak: (min) => set((s) => ({ settings: { ...s.settings, pomodoro: { ...s.settings.pomodoro, longBreakDuration: min } } })),
      setDefaultSummaryType: (t) => set((s) => ({ settings: { ...s.settings, defaultSummaryType: t } })),
      resetSettings: () => set({ settings: DEFAULT_SETTINGS }),
    }),
    { name: STORE_KEY }
  )
);
