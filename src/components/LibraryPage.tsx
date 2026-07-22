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

type Props = {
  onOpenSample: () => void;
  onOpenGenerated: (entry: LessonIndexEntry) => void;
  onGenerateNew: () => void;
};

export function LibraryPage({ onOpenSample, onOpenGenerated, onGenerateNew }: Props) {
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

  return (
    <div className="shell">
      <div className="shell-header">
        <div className="shell-header-text">
          <h1 className="shell-title">Context Reader</h1>
          <p className="shell-subtitle">Интерактивные тексты для чтения на французском</p>
        </div>
        <button className="btn primary" type="button" onClick={onGenerateNew}>
          + Новый урок
        </button>
      </div>

      <div className="lesson-grid">
        <button className="lesson-card" type="button" onClick={onOpenSample}>
          <div className="lesson-card-title">{sampleLesson.title}</div>
          {sampleLesson.translatedTitle && <p className="lesson-card-translated">{sampleLesson.translatedTitle}</p>}
          <div className="lesson-card-meta">
            {sampleLesson.language} · {sampleLesson.level} · {sampleLesson.estimatedMinutes} мин
          </div>
        </button>

        {entries?.map((entry) => (
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

      {!failed && entries !== null && entries.length === 0 && (
        <p className="empty-state">Сгенерированных уроков пока нет — начни с «+ Новый урок».</p>
      )}
    </div>
  );
}
