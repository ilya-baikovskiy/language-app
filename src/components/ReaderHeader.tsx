import { useEffect, useRef, useState } from 'react';
import type { Lesson } from '../types/lesson';
import type { ArticleFontSize, ReaderTheme } from '../types/reader';
import { SettingsMenu } from './SettingsMenu';

type Props = {
  lesson: Lesson;
  theme: ReaderTheme;
  onThemeChange: (theme: ReaderTheme) => void;
  fontSize: ArticleFontSize;
  onFontSizeChange: (size: ArticleFontSize) => void;
  translationMode: boolean;
  onTranslationModeChange: (on: boolean) => void;
  onBack?: () => void;
};

export function ReaderHeader({
  lesson,
  theme,
  onThemeChange,
  fontSize,
  onFontSizeChange,
  translationMode,
  onTranslationModeChange,
  onBack,
}: Props) {
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSettingsOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSettingsOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSettingsOpen]);

  return (
    <header className="header">
      <button className="icon-btn" type="button" aria-label="Назад" onClick={onBack} disabled={!onBack}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path
            d="M15 18l-6-6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div className="header-meta">
        <h1>{lesson.title}</h1>
        <p>
          {lesson.language} · {lesson.level} · {lesson.estimatedMinutes} мин
        </p>
      </div>

      <div className="header-settings" ref={settingsRef}>
        <button
          className="icon-btn"
          type="button"
          aria-label="Настройки текста"
          aria-expanded={isSettingsOpen}
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
            <path
              d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
              stroke="currentColor"
              strokeWidth="1.6"
            />
          </svg>
        </button>
        {isSettingsOpen && (
          <SettingsMenu
            theme={theme}
            onThemeChange={onThemeChange}
            fontSize={fontSize}
            onFontSizeChange={onFontSizeChange}
            translationMode={translationMode}
            onTranslationModeChange={onTranslationModeChange}
          />
        )}
      </div>
    </header>
  );
}
