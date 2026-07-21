import type { ArticleFontSize, ReaderTheme } from '../types/reader';

type Props = {
  theme: ReaderTheme;
  onThemeChange: (theme: ReaderTheme) => void;
  fontSize: ArticleFontSize;
  onFontSizeChange: (size: ArticleFontSize) => void;
  translationMode: boolean;
  onTranslationModeChange: (on: boolean) => void;
};

export function SettingsMenu({
  theme,
  onThemeChange,
  fontSize,
  onFontSizeChange,
  translationMode,
  onTranslationModeChange,
}: Props) {
  return (
    <div className="settings-popover" role="menu">
      <div className="settings-row">
        <span className="settings-label">Тема</span>
        <div className="settings-seg" role="group" aria-label="Тема оформления">
          <button type="button" aria-pressed={theme === 'light'} onClick={() => onThemeChange('light')}>
            Светлая
          </button>
          <button type="button" aria-pressed={theme === 'dark'} onClick={() => onThemeChange('dark')}>
            Тёмная
          </button>
        </div>
      </div>
      <div className="settings-row">
        <span className="settings-label">Размер текста</span>
        <div className="settings-seg" role="group" aria-label="Размер текста">
          <button
            type="button"
            style={{ fontSize: 12 }}
            aria-pressed={fontSize === 'small'}
            aria-label="Мелкий текст"
            onClick={() => onFontSizeChange('small')}
          >
            A
          </button>
          <button
            type="button"
            style={{ fontSize: 14 }}
            aria-pressed={fontSize === 'medium'}
            aria-label="Средний текст"
            onClick={() => onFontSizeChange('medium')}
          >
            A
          </button>
          <button
            type="button"
            style={{ fontSize: 17 }}
            aria-pressed={fontSize === 'large'}
            aria-label="Крупный текст"
            onClick={() => onFontSizeChange('large')}
          >
            A
          </button>
        </div>
      </div>
      <div className="settings-row">
        <span className="settings-label">Перевод предложений</span>
        <div className="settings-seg" role="group" aria-label="Перевод предложений">
          <button type="button" aria-pressed={!translationMode} onClick={() => onTranslationModeChange(false)}>
            Выкл
          </button>
          <button type="button" aria-pressed={translationMode} onClick={() => onTranslationModeChange(true)}>
            Вкл
          </button>
        </div>
      </div>
    </div>
  );
}
