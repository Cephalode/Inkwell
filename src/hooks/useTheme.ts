import { useCallback, useEffect, useReducer } from 'react';
import { useSettingsStore } from '../store/settingsStore';

export function useTheme() {
  const theme = useSettingsStore((s) => s.settings.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}

/** `'dark' | 'light' | null` — null while the theme hasn't been applied to <html> yet. */
export function useResolvedTheme(): 'dark' | 'light' | null {
  const [resolved, setResolved] = useReducer((_: 'dark' | 'light' | null, c: 'dark' | 'light' | null) => c, null);
  useEffect(() => {
    const cls = document.documentElement.classList;
    const update = () => setResolved(cls.contains('dark') ? 'dark' : cls.contains('light') ? 'light' : null);
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return resolved;
}
