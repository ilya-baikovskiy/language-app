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
import type { TrainingPhraseMode } from '../content-system/userTypes';
import type { LanguageCode } from '../../lib/pipeline/languageConfig';

type Props = {
  activeLanguage: LanguageCode;
  trainingPhraseMode: TrainingPhraseMode;
};

type PracticeSession = {
  words: SavedWord[];
  phraseMode: TrainingPhraseMode;
  freePractice: boolean;
};

export function LearnPage({ activeLanguage, trainingPhraseMode }: Props) {
  const { savedWords, loading, updateWord } = useSavedWords();
  const [practiceSession, setPracticeSession] = useState<PracticeSession | null>(null);

  const filteredWords = savedWords.filter((word) => word.language === activeLanguage);
  const dueWords = useMemo(() => selectPracticeQueue(filteredWords), [filteredWords]);

  if (practiceSession) {
    return (
      <TrainingPracticeView
        words={practiceSession.words}
        phraseMode={practiceSession.phraseMode}
        freePractice={practiceSession.freePractice}
        onExit={() => setPracticeSession(null)}
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
          onClick={() => setPracticeSession({ words: [...dueWords], phraseMode: trainingPhraseMode, freePractice: false })}
        >
          Начать
        </button>
      </div>

      {!loading && filteredWords.length === 0 ? (
        <p className="empty-state">
          Пока нет сохранённых слов и фраз для этого языка — сохраняй их прямо из чтения, нажимая на слово.
        </p>
      ) : !loading && dueWords.length === 0 ? (
        <div className="empty-state">
          <p>На сегодня всё. Следующие слова появятся здесь по расписанию.</p>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setPracticeSession({ words: [...filteredWords], phraseMode: trainingPhraseMode, freePractice: true })}
          >
            Повторить ещё раз (вне расписания)
          </button>
        </div>
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
