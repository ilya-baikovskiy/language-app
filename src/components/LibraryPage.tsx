import { useEffect, useState } from 'react';
import { sampleLesson } from '../data/sampleLesson';
import { fetchLessonsIndex, type LessonIndexEntry } from '../services/generation/lessonsApi';

type Props = {
  onOpenSample: () => void;
  onOpenGenerated: (entry: LessonIndexEntry) => void;
  onGenerateNew: () => void;
};

export function LibraryPage({ onOpenSample, onOpenGenerated, onGenerateNew }: Props) {
  const [entries, setEntries] = useState<LessonIndexEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLessonsIndex().then((index) => {
      if (!cancelled) setEntries(index);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
              French · {entry.level} · {entry.estimatedMinutes} мин
            </div>
          </button>
        ))}
      </div>

      {entries !== null && entries.length === 0 && (
        <p className="empty-state">Сгенерированных уроков пока нет — начни с «+ Новый урок».</p>
      )}
    </div>
  );
}
