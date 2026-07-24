// Экран «Учить» — см.
// docs/content-system-v1.2/16_APPROVED_MOBILE_UX_AND_NAVIGATION.md §10.
// Показывает только сохранённые слова activeLanguage. SRS/интервалы/
// mastered state явно вне scope этого шага (16 §10) — «На сегодня» + CTA
// «Начать» — подготовленная оболочка, не имитирующая готовый алгоритм
// (кнопка decorative/неактивна). Тренировка (SM-2 и т.д.) — отдельная задача.
//
// useSavedWords (см. hooks/useSavedWords.ts) хранит language прямо на
// SavedWord — фильтр по activeLanguage прямой, без join через
// lessonId → languageCode, который был нужен старому useSavedUnits.
import { useSavedWords } from '../hooks/useSavedWords';
import type { LanguageCode } from '../../lib/pipeline/languageConfig';

type Props = {
  activeLanguage: LanguageCode;
};

export function LearnPage({ activeLanguage }: Props) {
  const { savedWords } = useSavedWords();

  const filteredWords = savedWords.filter((word) => word.language === activeLanguage);

  return (
    <div className="shell">
      <h1 className="shell-title">Учить</h1>

      <div className="learn-today">
        <div className="learn-today-text">
          <p className="learn-today-count">{filteredWords.length} слов и фраз сохранено</p>
          <p className="learn-today-hint">Повторение по расписанию появится в следующем обновлении.</p>
        </div>
        <button type="button" className="btn primary" disabled title="Активное повторение — в разработке">
          Начать
        </button>
      </div>

      {filteredWords.length === 0 ? (
        <p className="empty-state">
          Пока нет сохранённых слов и фраз для этого языка — сохраняй их прямо из чтения, нажимая на слово.
        </p>
      ) : (
        <ul className="learn-saved-list">
          {filteredWords.map((word) => (
            <li key={word.id} className="learn-saved-item">
              <span className="learn-saved-target">{word.surfaceForm}</span>
              <span className="learn-saved-translation">{word.translation}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
