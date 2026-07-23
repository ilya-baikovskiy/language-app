import type { GenerationProgress as Progress } from '../services/generation/generateLessonPipeline';

type StepKey = 'starting' | 'text' | 'audio' | 'align' | 'saving';

// Шаги «Объясняем слова» и «Размечаем фразы» убраны — объяснения подгружаются
// лениво, по клику читателя (см. AI_PIPELINE.md, «Bottom Sheet v2»), а
// разметки фраз на этапе генерации больше нет вообще: каждое слово кликабельно
// само по себе, связанная фраза решается внутри объяснения по клику, не заранее.
// 'starting' — только card → Lesson флоу (PR 3); ручной GenerateLessonPage
// его никогда не эмитит, поэтому индекс шага просто не найдётся (-1) и первый
// пункт списка ведёт себя как раньше.
const STEPS: { key: StepKey; label: string }[] = [
  { key: 'starting', label: 'Готовим план' },
  { key: 'text', label: 'Пишем текст' },
  { key: 'audio', label: 'Озвучиваем' },
  { key: 'align', label: 'Синхронизируем аудио' },
  { key: 'saving', label: 'Сохраняем' },
];

type Props = {
  progress: Progress;
};

export function GenerationProgress({ progress }: Props) {
  const currentIndex = STEPS.findIndex((s) => s.key === progress.stage);

  return (
    <div className="progress-list">
      {STEPS.map((step, index) => {
        const isDone = index < currentIndex;
        const isActive = index === currentIndex;
        const className = `progress-step${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}`;

        return (
          <div className={className} key={step.key}>
            <span className="progress-step-icon" aria-hidden="true">
              {isDone ? '✓' : isActive ? <SpinnerIcon /> : ''}
            </span>
            <span>{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function SpinnerIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="40 100" />
    </svg>
  );
}
