// Экран «Учить» — см.
// docs/content-system-v1.2/16_APPROVED_MOBILE_UX_AND_NAVIGATION.md §10.
// Показывает только сохранённые слова activeLanguage.
//
// Каркас тренировки (2026-07-28, см. PROGRESS.md) — «Начать» открывает
// TrainingPracticeView по утверждённым артефактам (docs/training-plan/),
// но БЕЗ SM-2/AI-шага короткой фразы/голоса/реального тапа по слову — это
// пока вёрстка поверх реальных сохранённых слов, не полноценный алгоритм
// повторения. Тренируем все сохранённые слова языка — настоящего
// планировщика (какие слова реально «на сегодня») ещё нет.
//
// useSavedWords (см. hooks/useSavedWords.ts) хранит language прямо на
// SavedWord — фильтр по activeLanguage прямой, без join через
// lessonId → languageCode, который был нужен старому useSavedUnits.
import { useState } from 'react';
import { useSavedWords } from '../hooks/useSavedWords';
import { TrainingPracticeView } from './TrainingPracticeView';
import type { LanguageCode } from '../../lib/pipeline/languageConfig';

type Props = {
  activeLanguage: LanguageCode;
};

export function LearnPage({ activeLanguage }: Props) {
  const { savedWords } = useSavedWords();
  const [practicing, setPracticing] = useState(false);

  const filteredWords = savedWords.filter((word) => word.language === activeLanguage);

  if (practicing) {
    return <TrainingPracticeView words={filteredWords} onExit={() => setPracticing(false)} />;
  }

  return (
    <div className="shell">
      <h1 className="shell-title">Учить</h1>

      <div className="learn-today">
        <div className="learn-today-text">
          <p className="learn-today-count">{filteredWords.length} слов и фраз сохранено</p>
          <p className="learn-today-hint">Расписание повторов ещё не считается — тренируем всё сохранённое.</p>
        </div>
        <button
          type="button"
          className="btn primary"
          disabled={filteredWords.length === 0}
          onClick={() => setPracticing(true)}
        >
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
