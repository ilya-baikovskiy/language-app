// Экран «Учить» — см.
// docs/content-system-v1.2/16_APPROVED_MOBILE_UX_AND_NAVIGATION.md §10.
// Показывает только сохранённые слова activeLanguage.
//
// useSavedWords (см. hooks/useSavedWords.ts) хранит language прямо на
// SavedWord — фильтр по activeLanguage прямой, без join через
// lessonId → languageCode, который был нужен старому useSavedUnits.
import { useMemo, useState } from 'react';
import { useSavedWords } from '../hooks/useSavedWords';
import { TrainingPracticeView } from './TrainingPracticeView';
import { selectPracticeQueue } from '../content-system/srs';
import type { SavedWord } from '../content-system/savedWord';
import type { LanguageCode } from '../../lib/pipeline/languageConfig';

type Props = {
  activeLanguage: LanguageCode;
};

export function LearnPage({ activeLanguage }: Props) {
  const { savedWords, loading, updateWord } = useSavedWords();
  const [practiceWords, setPracticeWords] = useState<SavedWord[] | null>(null);

  const filteredWords = savedWords.filter((word) => word.language === activeLanguage);
  const dueWords = useMemo(() => selectPracticeQueue(filteredWords), [filteredWords]);

  if (practiceWords) {
    return (
      <TrainingPracticeView
        words={practiceWords}
        onExit={() => setPracticeWords(null)}
        onUpdateWord={updateWord}
      />
    );
  }

  return (
    <div className="shell">
      <h1 className="shell-title">Учить</h1>

      <div className="learn-today">
        <div className="learn-today-text">
          <p className="learn-today-count">
            {loading ? 'Загружаем слова…' : `${dueWords.length} на сегодня`}
          </p>
          <p className="learn-today-hint">
            {filteredWords.length} сохранено · новые слова: до 10 за сессию
          </p>
        </div>
        <button
          type="button"
          className="btn primary"
          disabled={loading || dueWords.length === 0}
          onClick={() => setPracticeWords([...dueWords])}
        >
          Начать
        </button>
      </div>

      {!loading && filteredWords.length === 0 ? (
        <p className="empty-state">
          Пока нет сохранённых слов и фраз для этого языка — сохраняй их прямо из чтения, нажимая на слово.
        </p>
      ) : !loading && dueWords.length === 0 ? (
        <p className="empty-state">На сегодня всё. Следующие слова появятся здесь по расписанию.</p>
      ) : (
        <ul className="learn-saved-list">
          {filteredWords.map((word) => (
            <li key={word.id} className="learn-saved-item">
              <span className="learn-saved-target">{word.surfaceForm}</span>
              <span className="learn-saved-translation">
                {word.translation} · {new Date(word.review.dueAt).getTime() <= Date.now() ? 'сегодня' : `до ${new Date(word.review.dueAt).toLocaleDateString('ru-RU')}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
