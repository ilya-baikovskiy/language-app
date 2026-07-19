import { sampleLesson } from '../data/sampleLesson';
import { useReaderPreferences } from '../hooks/useReaderPreferences';
import type { PlaybackStatus } from '../types/reader';
import { ReaderHeader } from './ReaderHeader';
import { ArticleContent } from './ArticleContent';
import { NarrationPlayer } from './NarrationPlayer';
import { ExplanationSheet } from './ExplanationSheet';

export function ReaderPage() {
  const { theme, setTheme, fontSize, setFontSize } = useReaderPreferences();

  // Этап 1: страница рендерится в естественном Idle-состоянии (раздел 7.1 ТЗ) —
  // плеер скрыт, подсветки нет, Bottom Sheet закрыт. Реальные переходы между
  // состояниями по клику/озвучке подключаются в Этапе 2–3.
  const playbackStatus: PlaybackStatus = 'idle';
  const demoAnnotation = sampleLesson.annotations.find((a) => a.id === 'ann-avoir-besoin')!;

  return (
    <div className="app">
      <ReaderHeader
        lesson={sampleLesson}
        theme={theme}
        onThemeChange={setTheme}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
      />

      <ArticleContent lesson={sampleLesson} />

      {playbackStatus === 'idle' ? (
        <button className="fab-play" type="button" aria-label="Слушать">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      ) : (
        <NarrationPlayer />
      )}

      <ExplanationSheet annotation={demoAnnotation} isOpen={false} />
    </div>
  );
}
