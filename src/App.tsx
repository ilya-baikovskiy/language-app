import { useState } from 'react';
import { LibraryPage } from './components/LibraryPage';
import { GenerateLessonPage } from './components/GenerateLessonPage';
import { ReaderPage } from './components/ReaderPage';
import { TopBar } from './components/TopBar';
import { BottomNav, type BottomNavTab } from './components/BottomNav';
import { ChoosePage } from './components/ChoosePage';
import { LearnPage } from './components/LearnPage';
import { SettingsOverlay } from './components/SettingsOverlay';
import { useAppPreferences } from './hooks/useAppPreferences';
import { useLanguageProfiles } from './hooks/useLanguageProfiles';
import { sampleLesson } from './data/sampleLesson';
import type { Lesson } from './types/lesson';
import type { LessonIndexEntry } from './services/generation/lessonsApi';

// View — см. брифа §PR 2: три постоянных таба (bottom nav) + два полноэкранных
// оверлея (generate, reader), не входящих в bottom nav (16 §2 — «Reader не
// является четвёртой вкладкой»). `returnTo` на reader/generate — «возврат из
// Reader ведёт в тот раздел, из которого пользователь открыл материал» (16 §3).
type View =
  | { tab: BottomNavTab }
  | { kind: 'generate'; returnTo: BottomNavTab }
  | { kind: 'reader'; lesson: Lesson; audioSrc: string; returnTo: BottomNavTab };

function App() {
  const [view, setView] = useState<View>({ tab: 'choose' });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { activeLanguage, setActiveLanguage, preferences, setEnabledTopicIds, setEnabledCountryOrRegionIds } =
    useAppPreferences();
  const { getLevel, setLevel } = useLanguageProfiles();

  const currentTab: BottomNavTab = 'tab' in view ? view.tab : view.returnTo;

  function openSample() {
    setView({ kind: 'reader', lesson: sampleLesson, audioSrc: '/audio/lesson-fr.mp3', returnTo: currentTab });
  }

  async function openGenerated(entry: LessonIndexEntry) {
    setLoadError(null);
    try {
      const res = await fetch(entry.lessonUrl);
      if (!res.ok) throw new Error(`Не удалось загрузить урок (${res.status})`);
      const lesson = (await res.json()) as Lesson;
      setView({ kind: 'reader', lesson, audioSrc: entry.audioUrl, returnTo: currentTab });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить урок');
    }
  }

  if ('kind' in view && view.kind === 'generate') {
    return (
      <GenerateLessonPage
        onBack={() => setView({ tab: view.returnTo })}
        onGenerated={(lesson, audioUrl) =>
          setView({ kind: 'reader', lesson, audioSrc: audioUrl, returnTo: view.returnTo })
        }
      />
    );
  }

  if ('kind' in view && view.kind === 'reader') {
    return <ReaderPage lesson={view.lesson} audioSrc={view.audioSrc} onBack={() => setView({ tab: view.returnTo })} />;
  }

  return (
    <>
      <TopBar
        activeLanguage={activeLanguage}
        getLevel={getLevel}
        onChangeLanguage={setActiveLanguage}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {view.tab === 'choose' && (
        <ChoosePage
          activeLanguage={activeLanguage}
          selectedLevel={getLevel(activeLanguage)}
          enabledTopicIds={preferences.enabledTopicIds}
          enabledCountryOrRegionIds={preferences.enabledCountryOrRegionIds}
          // Card → Lesson через LessonBlueprint — PR 3, ещё не реализовано
          // (см. ContentCardTile.tsx — CTA видимый, но не запускает
          // генерацию). onRead здесь пока не используется вызывающей стороной.
          onRead={() => {}}
        />
      )}
      {view.tab === 'library' && (
        <>
          <LibraryPage
            activeLanguage={activeLanguage}
            onOpenSample={openSample}
            onOpenGenerated={openGenerated}
            onGenerateNew={() => setView({ kind: 'generate', returnTo: 'library' })}
          />
          {loadError && (
            <p className="tts-error-note" role="status">
              {loadError}
            </p>
          )}
        </>
      )}
      {view.tab === 'learn' && <LearnPage activeLanguage={activeLanguage} />}

      <BottomNav active={view.tab} onSelect={(tab) => setView({ tab })} />

      <SettingsOverlay
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        getLevel={getLevel}
        onChangeLevel={setLevel}
        enabledTopicIds={preferences.enabledTopicIds}
        enabledCountryOrRegionIds={preferences.enabledCountryOrRegionIds}
        onToggleTopic={(topicId) => {
          const next = preferences.enabledTopicIds.includes(topicId)
            ? preferences.enabledTopicIds.filter((id) => id !== topicId)
            : [...preferences.enabledTopicIds, topicId];
          setEnabledTopicIds(next);
        }}
        onToggleCountry={(countryId) => {
          const next = preferences.enabledCountryOrRegionIds.includes(countryId)
            ? preferences.enabledCountryOrRegionIds.filter((id) => id !== countryId)
            : [...preferences.enabledCountryOrRegionIds, countryId];
          setEnabledCountryOrRegionIds(next);
        }}
      />
    </>
  );
}

export default App;
