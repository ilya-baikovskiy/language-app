import { useState } from 'react';
import { LibraryPage } from './components/LibraryPage';
import { GenerateLessonPage } from './components/GenerateLessonPage';
import { ReaderPage } from './components/ReaderPage';
import { sampleLesson } from './data/sampleLesson';
import type { Lesson } from './types/lesson';
import type { LessonIndexEntry } from './services/generation/lessonsApi';

type View =
  | { kind: 'library' }
  | { kind: 'generate' }
  | { kind: 'reader'; lesson: Lesson; audioSrc: string };

function App() {
  const [view, setView] = useState<View>({ kind: 'library' });
  const [loadError, setLoadError] = useState<string | null>(null);

  function openSample() {
    setView({ kind: 'reader', lesson: sampleLesson, audioSrc: '/audio/lesson-fr.mp3' });
  }

  async function openGenerated(entry: LessonIndexEntry) {
    setLoadError(null);
    try {
      const res = await fetch(entry.lessonUrl);
      if (!res.ok) throw new Error(`Не удалось загрузить урок (${res.status})`);
      const lesson = (await res.json()) as Lesson;
      setView({ kind: 'reader', lesson, audioSrc: entry.audioUrl });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить урок');
    }
  }

  if (view.kind === 'generate') {
    return (
      <GenerateLessonPage
        onBack={() => setView({ kind: 'library' })}
        onGenerated={(lesson, audioUrl) => setView({ kind: 'reader', lesson, audioSrc: audioUrl })}
      />
    );
  }

  if (view.kind === 'reader') {
    return <ReaderPage lesson={view.lesson} audioSrc={view.audioSrc} onBack={() => setView({ kind: 'library' })} />;
  }

  return (
    <>
      <LibraryPage
        onOpenSample={openSample}
        onOpenGenerated={openGenerated}
        onGenerateNew={() => setView({ kind: 'generate' })}
      />
      {loadError && (
        <p className="tts-error-note" role="status">
          {loadError}
        </p>
      )}
    </>
  );
}

export default App;
