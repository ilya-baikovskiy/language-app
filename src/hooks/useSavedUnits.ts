import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'context-reader:saved';

// Сохранённое слово/фраза. Стаб v1: складываем в localStorage, экрана просмотра
// сохранённого пока нет (см. BOTTOM_SHEET_WIP.md, Этап D).
export type SavedUnit = {
  lessonId: string;
  tokenId: string;
  displayText: string;
  shortTranslation: string;
  savedAt: number;
};

function loadStored(): SavedUnit[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedUnit[]) : [];
  } catch {
    return [];
  }
}

function keyOf(lessonId: string, tokenId: string): string {
  return `${lessonId}::${tokenId}`;
}

export function useSavedUnits(): {
  savedUnits: SavedUnit[];
  isSaved: (lessonId: string, tokenId: string) => boolean;
  toggleSave: (unit: Omit<SavedUnit, 'savedAt'>) => void;
} {
  const [savedUnits, setSavedUnits] = useState<SavedUnit[]>(() => loadStored());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedUnits));
    } catch {
      // localStorage unavailable (private mode, quota) — save just won't persist
    }
  }, [savedUnits]);

  const isSaved = useCallback(
    (lessonId: string, tokenId: string) => savedUnits.some((u) => u.lessonId === lessonId && u.tokenId === tokenId),
    [savedUnits],
  );

  const toggleSave = useCallback((unit: Omit<SavedUnit, 'savedAt'>) => {
    setSavedUnits((prev) => {
      const k = keyOf(unit.lessonId, unit.tokenId);
      const exists = prev.some((u) => keyOf(u.lessonId, u.tokenId) === k);
      if (exists) {
        return prev.filter((u) => keyOf(u.lessonId, u.tokenId) !== k);
      }
      return [...prev, { ...unit, savedAt: Date.now() }];
    });
  }, []);

  return { savedUnits, isSaved, toggleSave };
}
