// Верхняя панель — глобальный language selector + кнопка настроек. См.
// docs/content-system-v1.2/16_APPROVED_MOBILE_UX_AND_NAVIGATION.md §4, §16
// (aria-expanded/listbox semantics, visible focus).
//
// Флаг — только визуальный маркер (16 §4: «каноническая сущность в данных —
// код языка, а не страна/флаг»). Выбор конкретного флага для English
// намеренно не финализирован документом — оставлен 🇬🇧 как временное
// решение, см. финальный отчёт по PR 2.
import { useEffect, useRef, useState } from 'react';
import { listLanguageConfigs, type LanguageCode } from '../../lib/pipeline/languageConfig';
import type { CEFRLevel } from '../content-system/types';

const FLAG_BY_LANGUAGE: Record<LanguageCode, string> = {
  fr: '🇫🇷',
  de: '🇩🇪',
  en: '🇬🇧',
  el: '🇬🇷',
};

const LANGUAGES = listLanguageConfigs();

type Props = {
  activeLanguage: LanguageCode;
  getLevel: (language: LanguageCode) => CEFRLevel;
  onChangeLanguage: (language: LanguageCode) => void;
  onOpenSettings: () => void;
};

export function TopBar({ activeLanguage, getLevel, onChangeLanguage, onOpenSettings }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <header className="app-topbar">
      <div className="app-topbar-brand">Context Reader</div>
      <div className="app-topbar-actions">
        <div className="global-language-control" ref={containerRef}>
          <button
            type="button"
            className={`global-language-button ${open ? 'open' : ''}`}
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen((prev) => !prev)}
          >
            <span aria-hidden="true">{FLAG_BY_LANGUAGE[activeLanguage]}</span>
            <span className="global-language-main">
              <span>{LANGUAGES.find((l) => l.code === activeLanguage)?.displayName ?? activeLanguage}</span>
              <span className="global-language-level">{getLevel(activeLanguage)}</span>
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {open && (
            <ul className="global-language-menu open" role="listbox" aria-label="Активный язык">
              {LANGUAGES.map((config) => (
                <li key={config.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={config.code === activeLanguage}
                    className={`global-language-option ${config.code === activeLanguage ? 'active' : ''}`}
                    onClick={() => {
                      onChangeLanguage(config.code);
                      setOpen(false);
                    }}
                  >
                    <span className="global-language-option-main">
                      <strong>
                        {FLAG_BY_LANGUAGE[config.code]} {config.displayName}
                      </strong>
                      <small>{getLevel(config.code)}</small>
                    </span>
                    {config.code === activeLanguage && <span className="global-language-option-check">✓</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" className="icon-btn" aria-label="Настройки" onClick={onOpenSettings}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 15a3 3 0 100-6 3 3 0 000 6z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
