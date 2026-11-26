import { useEffect, useState } from 'preact/hooks';

export type ZSpectTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'zspect_theme';

export function useZSpectTheme(): {
  theme: ZSpectTheme;
  toggleTheme: () => void;
  setTheme: (next: ZSpectTheme) => void;
} {
  const [theme, setThemeState] = useState<ZSpectTheme>('light');

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local
        .get(THEME_STORAGE_KEY)
        .then((res) => {
          const saved = res[THEME_STORAGE_KEY];
          if (saved === 'dark' || saved === 'light') {
            setThemeState(saved);
          }
        })
        .catch(() => {});

      const onStorageChanged = (
        changes: Record<string, chrome.storage.StorageChange>,
        area: string,
      ) => {
        if (area === 'local' && changes[THEME_STORAGE_KEY]) {
          const next = changes[THEME_STORAGE_KEY].newValue;
          if (next === 'dark' || next === 'light') {
            setThemeState(next);
          }
        }
      };

      chrome.storage.onChanged.addListener(onStorageChanged);
      return () => chrome.storage.onChanged.removeListener(onStorageChanged);
    }
  }, []);

  const setTheme = (next: ZSpectTheme) => {
    setThemeState(next);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ [THEME_STORAGE_KEY]: next }).catch(() => {});
    }
  };

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return { theme, toggleTheme, setTheme };
}
