import { useCallback } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import type { ThemeMode } from '../types/settings';

export function useTheme() {
  const theme = useSettingsStore((s) => s.settings.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
