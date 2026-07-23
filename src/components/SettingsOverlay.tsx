// Модальные настройки — см.
// docs/content-system-v1.2/16_APPROVED_MOBILE_UX_AND_NAVIGATION.md §12.
// Три блока: уровень для каждого языка, общие темы, общие страны/регионы.
// Открывается из TopBar, не занимает отдельную вкладку bottom nav (16 §2).
import { useEffect, useRef } from 'react';
import { listLanguageConfigs, type LanguageCode } from '../../lib/pipeline/languageConfig';
import { CEFR_LEVELS, type CEFRLevel } from '../content-system/types';
import { TOPICS, COUNTRIES } from '../content-system/catalog';

const LANGUAGES = listLanguageConfigs();

type Props = {
  open: boolean;
  onClose: () => void;
  getLevel: (language: LanguageCode) => CEFRLevel;
  onChangeLevel: (language: LanguageCode, level: CEFRLevel) => void;
  enabledTopicIds: string[];
  enabledCountryOrRegionIds: string[];
  onToggleTopic: (topicId: string) => void;
  onToggleCountry: (countryId: string) => void;
};

export function SettingsOverlay({
  open,
  onClose,
  getLevel,
  onChangeLevel,
  enabledTopicIds,
  enabledCountryOrRegionIds,
  onToggleTopic,
  onToggleCountry,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="overlay open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="modal-inner">
          <div className="modal-head">
            <h2 id="settings-title">Настройки</h2>
            <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <section className="settings-section">
            <h3 className="settings-section-title">Уровень по языкам</h3>
            <div className="settings-level-grid">
              {LANGUAGES.map((config) => (
                <div className="form-field" key={config.code}>
                  <label className="form-label" htmlFor={`level-${config.code}`}>
                    {config.displayName}
                  </label>
                  <select
                    id={`level-${config.code}`}
                    className="form-select"
                    value={getLevel(config.code)}
                    onChange={(e) => onChangeLevel(config.code, e.target.value as CEFRLevel)}
                  >
                    {CEFR_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <h3 className="settings-section-title">Темы</h3>
            <div className="settings-chip-grid">
              {TOPICS.map((topic) => {
                const active = enabledTopicIds.includes(topic.id);
                return (
                  <button
                    key={topic.id}
                    type="button"
                    className={`settings-chip ${active ? 'active' : ''}`}
                    aria-pressed={active}
                    onClick={() => onToggleTopic(topic.id)}
                  >
                    {topic.labelRu}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="settings-section">
            <h3 className="settings-section-title">Страны и регионы</h3>
            <div className="settings-chip-grid">
              {COUNTRIES.map((country) => {
                const active = enabledCountryOrRegionIds.includes(country.id);
                return (
                  <button
                    key={country.id}
                    type="button"
                    className={`settings-chip ${active ? 'active' : ''}`}
                    aria-pressed={active}
                    onClick={() => onToggleCountry(country.id)}
                  >
                    {country.labelRu}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
