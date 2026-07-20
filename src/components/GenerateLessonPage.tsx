import { useState } from 'react';
import type { InputSource } from '../../lib/pipeline/generateText';
import { generateLesson, type GenerationProgress as Progress } from '../services/generation/generateLessonPipeline';
import type { Lesson } from '../types/lesson';
import { GenerationProgress } from './GenerationProgress';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

type InputKind = 'text' | 'topic';

type Props = {
  onBack: () => void;
  onGenerated: (lesson: Lesson, audioUrl: string) => void;
};

export function GenerateLessonPage({ onBack, onGenerated }: Props) {
  const [kind, setKind] = useState<InputKind>('topic');
  const [text, setText] = useState('');
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState('A2');
  const [words, setWords] = useState(150);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isGenerating = progress !== null;
  const canSubmit = kind === 'text' ? text.trim().length > 0 : topic.trim().length > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || isGenerating) return;

    setError(null);
    setProgress({ stage: 'text' });

    const input: InputSource = kind === 'text' ? { kind: 'text', content: text } : { kind: 'topic', prompt: topic };

    try {
      const { lesson, audioUrl } = await generateLesson(input, { level, words }, setProgress);
      onGenerated(lesson, audioUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сгенерировать урок');
      setProgress(null);
    }
  }

  return (
    <div className="shell">
      <div className="shell-header">
        <button className="icon-btn" type="button" aria-label="Назад" onClick={onBack} disabled={isGenerating}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="shell-header-text">
          <h1 className="shell-title">Новый урок</h1>
          <p className="shell-subtitle">Французский · займёт пару минут</p>
        </div>
      </div>

      {isGenerating ? (
        <GenerationProgress progress={progress} />
      ) : (
        <form className="generate-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <span className="form-label">Материал</span>
            <div className="input-kind-toggle" role="group" aria-label="Тип материала">
              <button type="button" aria-pressed={kind === 'topic'} onClick={() => setKind('topic')}>
                Тема
              </button>
              <button type="button" aria-pressed={kind === 'text'} onClick={() => setKind('text')}>
                Свой текст
              </button>
            </div>
          </div>

          {kind === 'topic' ? (
            <div className="form-field">
              <label className="form-label" htmlFor="topic-input">
                О чём текст
              </label>
              <input
                id="topic-input"
                className="form-input"
                type="text"
                placeholder="Например: прогулка по осеннему Парижу"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
          ) : (
            <div className="form-field">
              <label className="form-label" htmlFor="text-input">
                Текст для адаптации
              </label>
              <textarea
                id="text-input"
                className="form-textarea"
                rows={8}
                placeholder="Вставь статью или отрывок текста — AI адаптирует его под выбранный уровень"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          )}

          <div className="form-row">
            <div className="form-field">
              <label className="form-label" htmlFor="level-select">
                Уровень
              </label>
              <select id="level-select" className="form-select" value={level} onChange={(e) => setLevel(e.target.value)}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="words-select">
                Объём
              </label>
              <select
                id="words-select"
                className="form-select"
                value={words}
                onChange={(e) => setWords(Number(e.target.value))}
              >
                <option value={100}>~100 слов</option>
                <option value={150}>~150 слов</option>
                <option value={200}>~200 слов</option>
                <option value={250}>~250 слов</option>
              </select>
            </div>
          </div>
          <p className="form-hint">Объём ограничен снизу — так шаг озвучки надёжно укладывается в лимит хостинга.</p>

          {error && <p className="form-error">{error}</p>}

          <div>
            <button className="btn primary" type="submit" disabled={!canSubmit}>
              Сгенерировать
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
