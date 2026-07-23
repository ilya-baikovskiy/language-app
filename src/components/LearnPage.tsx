// Экран «Учить» — см.
// docs/content-system-v1.2/16_APPROVED_MOBILE_UX_AND_NAVIGATION.md §10.
// Показывает только сохранённые единицы activeLanguage. SRS/интервалы/
// mastered state явно вне scope этого PR (16 §10, брифа §«Не делать») —
// «На сегодня» + CTA «Начать» — подготовленная оболочка, не имитирующая
// готовый алгоритм (кнопка decorative/неактивна).
//
// useSavedUnits (см. hooks/useSavedUnits.ts) не хранит language на SavedUnit
// — схема сознательно не менялась (см. финальный отчёт PR 2: это была бы
// breaking-миграция существующих сохранений). Вместо этого здесь строится
// join lessonId → languageCode через BlobLessonArtifactRepository.listLessons()
// (тот же источник, что уже использует LibraryPage). Для lessonId без
// languageCode (легаси-уроки до мультиязычности, включая статичный
// sampleLesson) язык считается французским — тем же способом, что и
// entryLanguageName в LibraryPage.tsx.
import { useEffect, useState } from 'react';
import { useSavedUnits } from '../hooks/useSavedUnits';
import { BlobLessonArtifactRepository } from '../content-system/repositories/lessonArtifactRepository';
import type { LessonArtifactRepository } from '../content-system/repositories';
import { LOCAL_USER_ID } from '../content-system/userTypes';
import { sampleLesson } from '../data/sampleLesson';
import type { LanguageCode } from '../../lib/pipeline/languageConfig';

const DEFAULT_LEGACY_LANGUAGE: LanguageCode = 'fr';

const repository: LessonArtifactRepository = new BlobLessonArtifactRepository();

type Props = {
  activeLanguage: LanguageCode;
};

export function LearnPage({ activeLanguage }: Props) {
  const { savedUnits } = useSavedUnits();
  const [lessonLanguageById, setLessonLanguageById] = useState<Record<string, LanguageCode>>({
    [sampleLesson.id]: DEFAULT_LEGACY_LANGUAGE,
  });

  useEffect(() => {
    let cancelled = false;
    repository
      .listLessons(LOCAL_USER_ID)
      .then((summaries) => {
        if (cancelled) return;
        setLessonLanguageById((prev) => {
          const next = { ...prev };
          for (const summary of summaries) {
            next[summary.id] = (summary.languageCode as LanguageCode) || DEFAULT_LEGACY_LANGUAGE;
          }
          return next;
        });
      })
      .catch((err) => {
        console.error('Не удалось загрузить список уроков для фильтрации «Учить» по языку:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredUnits = savedUnits.filter(
    (unit) => (lessonLanguageById[unit.lessonId] ?? DEFAULT_LEGACY_LANGUAGE) === activeLanguage,
  );

  return (
    <div className="shell">
      <h1 className="shell-title">Учить</h1>

      <div className="learn-today">
        <div className="learn-today-text">
          <p className="learn-today-count">{filteredUnits.length} слов и фраз сохранено</p>
          <p className="learn-today-hint">Повторение по расписанию появится в следующем обновлении.</p>
        </div>
        <button type="button" className="btn primary" disabled title="Активное повторение — в разработке">
          Начать
        </button>
      </div>

      {filteredUnits.length === 0 ? (
        <p className="empty-state">
          Пока нет сохранённых слов и фраз для этого языка — сохраняй их прямо из чтения, нажимая на слово.
        </p>
      ) : (
        <ul className="learn-saved-list">
          {filteredUnits.map((unit) => (
            <li key={`${unit.lessonId}::${unit.tokenId}`} className="learn-saved-item">
              <span className="learn-saved-target">{unit.displayText}</span>
              <span className="learn-saved-translation">{unit.shortTranslation}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
