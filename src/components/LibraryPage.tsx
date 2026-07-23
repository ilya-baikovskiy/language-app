import { useEffect, useState } from 'react';
import { sampleLesson } from '../data/sampleLesson';
import { fetchLessonsIndex, type LessonIndexEntry } from '../services/generation/lessonsApi';
import { LANGUAGE_CONFIGS, type LanguageCode } from '../../lib/pipeline/languageConfig';

// Не getLanguageConfig (бросает на неизвестном коде) — entry.languageCode
// приходит из сохранённых данных, а не из кода приложения, безопаснее не
// уронить список библиотеки на одной странной записи.
function entryLanguageName(entry: LessonIndexEntry): string {
  const code = entry.languageCode as LanguageCode | undefined;
  return (code && LANGUAGE_CONFIGS[code]?.displayName) || 'French';
}

function entryLanguageCode(entry: LessonIndexEntry): LanguageCode {
  return (entry.languageCode as LanguageCode | undefined) || SAMPLE_LESSON_LANGUAGE;
}

// sampleLesson.language — строка отображения ('French'), не LanguageCode;
// материал сам по себе французский, поэтому фиксируем код здесь же явно.
const SAMPLE_LESSON_LANGUAGE: LanguageCode = 'fr';

type Props = {
  // Фильтр по activeLanguage (16 §9 — «экран показывает только уроки
  // activeLanguage»). Минимальное изменение к существующему компоненту —
  // полноценный блок «Продолжить» по lastOpenedAt/статусам вне scope этого
  // PR (нет персистентных полей в текущей модели данных, появятся вместе с
  // blueprint/library states в PR 3).
  activeLanguage: LanguageCode;
  onOpenSample: () => void;
  onOpenGenerated: (entry: LessonIndexEntry) => void;
  onGenerateNew: () => void;
};

export function LibraryPage({ activeLanguage, onOpenSample, onOpenGenerated, onGenerateNew }: Props) {
  const [entries, setEntries] = useState<LessonIndexEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetchLessonsIndex()
      .then((index) => {
        if (!cancelled) setEntries(index);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Не удалось загрузить список уроков:', err);
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

  const languageEntries = entries?.filter((entry) => entryLanguageCode(entry) === activeLanguage) ?? null;
  const showSample = activeLanguage === SAMPLE_LESSON_LANGUAGE;

  return (
    <div className="shell">
      <div className="shell-header">
        <div className="shell-header-text">
          <h1 className="shell-title">Мои тексты</h1>
          <p className="shell-subtitle">{LANGUAGE_CONFIGS[activeLanguage]?.displayName ?? activeLanguage}</p>
        </div>
        <button className="btn primary" type="button" onClick={onGenerateNew}>
          + Новый урок
        </button>
      </div>

      <div className="lesson-grid">
        {showSample && (
          <button className="lesson-card" type="button" onClick={onOpenSample}>
            <div className="lesson-card-title">{sampleLesson.title}</div>
            {sampleLesson.translatedTitle && <p className="lesson-card-translated">{sampleLesson.translatedTitle}</p>}
            <div className="lesson-card-meta">
              {sampleLesson.language} · {sampleLesson.level} · {sampleLesson.estimatedMinutes} мин
            </div>
          </button>
        )}

        {languageEntries?.map((entry) => (
          <button className="lesson-card" type="button" key={entry.slug} onClick={() => onOpenGenerated(entry)}>
            <div className="lesson-card-title">{entry.title}</div>
            {entry.translatedTitle && <p className="lesson-card-translated">{entry.translatedTitle}</p>}
            <div className="lesson-card-meta">
              {entryLanguageName(entry)} · {entry.level} · {entry.estimatedMinutes} мин
              {entry.audioProvider === 'elevenlabs' && ' · ElevenLabs'}
            </div>
          </button>
        ))}
      </div>

      {failed && (
        <p className="empty-state" role="status">
          Не удалось загрузить сохранённые уроки — они на месте, просто сейчас недоступны.{' '}
          <button type="button" className="translation-retry" onClick={() => setReloadNonce((n) => n + 1)}>
            Повторить
          </button>
        </p>
      )}

      {!failed && languageEntries !== null && languageEntries.length === 0 && !showSample && (
        <p className="empty-state">Сгенерированных уроков для этого языка пока нет — начни с «+ Новый урок».</p>
      )}
    </div>
  );
}
