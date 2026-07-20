import type { GenerationProgress as Progress } from '../services/generation/generateLessonPipeline';

type StepKey = 'text' | 'phrases' | 'audio' | 'align' | 'saving';

// Шаг «Объясняем слова» убран — объяснения слов/фраз теперь подгружаются лениво,
// по клику читателя (см. CLAUDE.md/PROGRESS.md), а не для всего урока на этапе
// генерации. Разметка фраз (phrases) остаётся: она дешёвая и структурно нужна
// сразу, чтобы клики по фразам работали как единое целое.
const STEPS: { key: StepKey; label: string }[] = [
  { key: 'text', label: 'Пишем текст' },
  { key: 'phrases', label: 'Размечаем фразы' },
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

        let count: string | null = null;
        if (isActive && progress.stage === 'phrases') count = `${progress.done}/${progress.total}`;

        return (
          <div className={className} key={step.key}>
            <span className="progress-step-icon" aria-hidden="true">
              {isDone ? '✓' : isActive ? <SpinnerIcon /> : ''}
            </span>
            <span>{step.label}</span>
            {count && <span className="progress-step-count">{count}</span>}
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
