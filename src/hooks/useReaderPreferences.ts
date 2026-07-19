import { useCallback, useEffect, useState } from 'react';
import type { ArticleFontSize, ReaderTheme } from '../types/reader';

const STORAGE_KEY = 'context-reader:preferences';

type StoredPreferences = {
  theme: ReaderTheme;
  fontSize: ArticleFontSize;
};

function getSystemTheme(): ReaderTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function loadStored(): Partial<StoredPreferences> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<StoredPreferences>) : {};
  } catch {
    return {};
  }
}

const FONT_SIZE_PX: Record<ArticleFontSize, { size: string; lineHeight: string }> = {
  small: { size: '19px', lineHeight: '1.68' },
  medium: { size: '21px', lineHeight: '1.72' },
  large: { size: '23px', lineHeight: '1.78' },
};

export function useReaderPreferences() {
  const [theme, setThemeState] = useState<ReaderTheme>(() => loadStored().theme ?? getSystemTheme());
  const [fontSize, setFontSizeState] = useState<ArticleFontSize>(() => loadStored().fontSize ?? 'medium');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const { size, lineHeight } = FONT_SIZE_PX[fontSize];
    document.documentElement.style.setProperty('--article-font-size', size);
    document.documentElement.style.setProperty('--article-line-height', lineHeight);
  }, [fontSize]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, fontSize }));
    } catch {
      // localStorage unavailable (private mode, quota) — preference just won't persist
    }
  }, [theme, fontSize]);

  const setTheme = useCallback((next: ReaderTheme) => setThemeState(next), []);
  const setFontSize = useCallback((next: ArticleFontSize) => setFontSizeState(next), []);

  return { theme, setTheme, fontSize, setFontSize };
}
