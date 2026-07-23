// card → Lesson full-screen view (PR 3) — shown while ChoosePage's "Читать"
// CTA generates the lesson for a specific card/language/level. Reuses
// GenerationProgress (PR 0) so the visual language matches the manual
// GenerateLessonPage flow.

import { useEffect, useState } from 'react';
import { generateLessonFromCard } from '../content-system/cardGeneration';
import { BlobLessonArtifactRepository } from '../content-system/repositories/lessonArtifactRepository';
import type { LessonArtifactRepository } from '../content-system/repositories';
import type { GenerationProgress as Progress } from '../services/generation/generateLessonPipeline';
import type { ContentCard, CEFRLevel } from '../content-system/types';
import type { LanguageCode } from '../../lib/pipeline/languageConfig';
import type { Lesson } from '../types/lesson';
import { GenerationProgress } from './GenerationProgress';

const lessonArtifactRepository: LessonArtifactRepository = new BlobLessonArtifactRepository();

type Props = {
  card: ContentCard;
  language: LanguageCode;
  targetLevel: CEFRLevel;
  onDone: (lesson: Lesson, audioUrl: string) => void;
  onCancelToChoose: () => void;
};

export function CardGenerationView({ card, language, targetLevel, onDone, onCancelToChoose }: Props) {
  const [progress, setProgress] = useState<Progress>({ stage: 'starting' });
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setProgress({ stage: 'starting' });

    generateLessonFromCard(card, language, targetLevel, lessonArtifactRepository, (p) => {
      if (!cancelled) setProgress(p);
    })
      .then(({ lesson, audioUrl }) => {
        if (!cancelled) onDone(lesson, audioUrl);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Не удалось сгенерировать текст');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, language, targetLevel, attempt]);

  return (
    <div className="shell">
      <div className="shell-header">
        <button className="icon-btn" type="button" aria-label="Назад" onClick={onCancelToChoose}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="shell-header-text">
          <h1 className="shell-title">Готовим текст</h1>
          <p className="shell-subtitle">{card.editorialTitleRu}</p>
        </div>
      </div>

      {error ? (
        <>
          <p className="form-error">{error}</p>
          <div>
            <button className="btn primary" type="button" onClick={() => setAttempt((n) => n + 1)}>
              Повторить
            </button>
          </div>
        </>
      ) : (
        <GenerationProgress progress={progress} />
      )}
    </div>
  );
}
