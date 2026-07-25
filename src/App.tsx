import { useState } from 'react';
import { LibraryPage } from './components/LibraryPage';
import { GenerateLessonPage } from './components/GenerateLessonPage';
import { CardGenerationView } from './components/CardGenerationView';
import { ReaderPage } from './components/ReaderPage';
import { TopBar } from './components/TopBar';
import { BottomNav, type BottomNavTab } from './components/BottomNav';
import { ChoosePage } from './components/ChoosePage';
import { LearnPage } from './components/LearnPage';
import { SettingsOverlay } from './components/SettingsOverlay';
import { useAppPreferences } from './hooks/useAppPreferences';
import { useLanguageProfiles } from './hooks/useLanguageProfiles';
import { sampleLesson } from './data/sampleLesson';
import { StaticSeedCardRepository } from './content-system/repositories/staticSeedCardRepository';
import { BlobGeneratedCardRepository } from './content-system/repositories/blobGeneratedCardRepository';
import { CompositeCardRepository } from './content-system/repositories/compositeCardRepository';
import { track } from './content-system/analytics/eventClient';
import type { CEFRLevel, ContentCard } from './content-system/types';
import type { LessonEntryPoint } from './content-system/analyticsEvent';
import type { LanguageCode } from '../lib/pipeline/languageConfig';
import type { Lesson } from './types/lesson';
import type { LessonIndexEntry } from './services/generation/lessonsApi';

// Тот же композит, что у ленты (useFeed.ts): seed-карточки из бандла ПЛЮС
// AI-пул (Pipeline A). Раньше здесь был только StaticSeedCardRepository, и
// «Повторить» у урока, сгенерированного из AI-карточки ('gen-...'), молча не
// находил её (getById → null → ранний return) — кнопка не делала ровным
// счётом ничего. Для seed-карточек всё работало, поэтому баг выглядел
// случайным.
const cardRepository = new CompositeCardRepository(
  new StaticSeedCardRepository(),
  new BlobGeneratedCardRepository(),
);

// View — см. брифа §PR 2/3: три постоянных таба (bottom nav) + полноэкранные
// оверлеи (generate, card-generating, reader), не входящие в bottom nav (16
// §2 — «Reader не является четвёртой вкладкой»). `returnTo` на reader/
// generate/card-generating — «возврат из Reader ведёт в тот раздел, из
// которого пользователь открыл материал» (16 §3). `entryPoint` — PR 4
// (05 §8 lesson_opened): 'generated_card' только для card → Lesson флоу,
// 'library' для sample/ручной генерации/уже сохранённого урока — 'resume'/
// 'deep_link' нечем наполнить в текущей навигации, см. финальный отчёт PR 4.
type View =
  | { tab: BottomNavTab }
  | { kind: 'generate'; returnTo: BottomNavTab }
  | { kind: 'card-generating'; card: ContentCard; language: LanguageCode; level: CEFRLevel; returnTo: BottomNavTab }
  | { kind: 'reader'; lesson: Lesson; audioSrc: string; returnTo: BottomNavTab; entryPoint: LessonEntryPoint };

function App() {
  const [view, setView] = useState<View>({ tab: 'choose' });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [retryingCardId, setRetryingCardId] = useState<string | null>(null);

  const { activeLanguage, setActiveLanguage, preferences, setEnabledTopicIds, setEnabledCountryOrRegionIds } =
    useAppPreferences();
  const { getLevel, setLevel } = useLanguageProfiles();

  const currentTab: BottomNavTab = 'tab' in view ? view.tab : view.returnTo;

  function openSample() {
    setView({ kind: 'reader', lesson: sampleLesson, audioSrc: '/audio/lesson-fr.mp3', returnTo: currentTab, entryPoint: 'library' });
  }

  async function openGenerated(entry: LessonIndexEntry) {
    setLoadError(null);
    try {
      const res = await fetch(entry.lessonUrl);
      if (!res.ok) throw new Error(`Не удалось загрузить урок (${res.status})`);
      const lesson = (await res.json()) as Lesson;
      setView({ kind: 'reader', lesson, audioSrc: entry.audioUrl, returnTo: currentTab, entryPoint: 'library' });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить урок');
    }
  }

  // ChoosePage's "Читать" CTA — card → Lesson через LessonBlueprint (PR 3).
  function readCard(card: ContentCard) {
    setView({ kind: 'card-generating', card, language: activeLanguage, level: getLevel(activeLanguage), returnTo: currentTab });
  }

  // LibraryPage "Повторить" на 'failed'-записи с cardId — тот же card-
  // generating flow, но с language/level из самой записи (16 §13), а не из
  // текущего activeLanguage/уровня, которые могли уже смениться.
  // Молча ничего не делать нельзя: getById ходит в сеть за AI-пулом, и все
  // три возможных исхода (медленно / карточки нет / запрос упал) выглядели для
  // пользователя одинаково — «кнопка не работает вообще». Поэтому: сразу
  // помечаем карточку как запускающуюся, а неуспех показываем текстом.
  async function retryCard(cardId: string, language: LanguageCode, level: CEFRLevel) {
    setLoadError(null);
    setRetryingCardId(cardId);
    try {
      const card = await cardRepository.getById(cardId);
      if (!card) {
        setLoadError('Карточка этого текста больше недоступна — создайте новый урок.');
        return;
      }
      setView({ kind: 'card-generating', card, language, level, returnTo: currentTab });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Не удалось запустить генерацию');
    } finally {
      setRetryingCardId(null);
    }
  }

  if ('kind' in view && view.kind === 'generate') {
    return (
      <GenerateLessonPage
        onBack={() => setView({ tab: view.returnTo })}
        onGenerated={(lesson, audioUrl) =>
          // Manual "+ Новый урок" flow from Library — same 'library' entry
          // point as opening an existing saved lesson (no better-fitting
          // value in the brief's LessonEntryPoint list, see PR 4 report).
          setView({ kind: 'reader', lesson, audioSrc: audioUrl, returnTo: view.returnTo, entryPoint: 'library' })
        }
      />
    );
  }

  if ('kind' in view && view.kind === 'card-generating') {
    return (
      <CardGenerationView
        card={view.card}
        language={view.language}
        targetLevel={view.level}
        onCancelToChoose={() => setView({ tab: view.returnTo })}
        onDone={(lesson, audioUrl) =>
          setView({ kind: 'reader', lesson, audioSrc: audioUrl, returnTo: view.returnTo, entryPoint: 'generated_card' })
        }
      />
    );
  }

  if ('kind' in view && view.kind === 'reader') {
    return (
      <ReaderPage
        lesson={view.lesson}
        audioSrc={view.audioSrc}
        onBack={() => setView({ tab: view.returnTo })}
        entryPoint={view.entryPoint}
        appActiveLanguage={activeLanguage}
      />
    );
  }

  function handleChangeLanguage(nextLanguage: LanguageCode) {
    track('global_language_changed', {
      fromLanguage: activeLanguage,
      toLanguage: nextLanguage,
      fromLevel: getLevel(activeLanguage),
      toLevel: getLevel(nextLanguage),
      currentTab,
    });
    setActiveLanguage(nextLanguage);
  }

  return (
    <>
      <TopBar
        activeLanguage={activeLanguage}
        getLevel={getLevel}
        onChangeLanguage={handleChangeLanguage}
        onOpenSettings={() => {
          track('settings_opened', {});
          setSettingsOpen(true);
        }}
      />

      {view.tab === 'choose' && (
        <ChoosePage
          activeLanguage={activeLanguage}
          selectedLevel={getLevel(activeLanguage)}
          enabledTopicIds={preferences.enabledTopicIds}
          enabledCountryOrRegionIds={preferences.enabledCountryOrRegionIds}
          onRead={readCard}
        />
      )}
      {view.tab === 'library' && (
        <>
          <LibraryPage
            activeLanguage={activeLanguage}
            onOpenSample={openSample}
            onOpenGenerated={openGenerated}
            onGenerateNew={() => setView({ kind: 'generate', returnTo: 'library' })}
            onRetryCard={retryCard}
            retryingCardId={retryingCardId}
          />
          {loadError && (
            <p className="tts-error-note" role="status">
              {loadError}
            </p>
          )}
        </>
      )}
      {view.tab === 'learn' && <LearnPage activeLanguage={activeLanguage} />}

      <BottomNav
        active={view.tab}
        onSelect={(tab) => {
          if (tab !== view.tab) track('bottom_navigation_selected', { fromTab: view.tab, toTab: tab });
          setView({ tab });
        }}
      />

      <SettingsOverlay
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        getLevel={getLevel}
        onChangeLevel={setLevel}
        enabledTopicIds={preferences.enabledTopicIds}
        enabledCountryOrRegionIds={preferences.enabledCountryOrRegionIds}
        onToggleTopic={(topicId) => {
          const isRemoving = preferences.enabledTopicIds.includes(topicId);
          const next = isRemoving
            ? preferences.enabledTopicIds.filter((id) => id !== topicId)
            : [...preferences.enabledTopicIds, topicId];
          track('topic_preferences_changed', {
            added: isRemoving ? [] : [topicId],
            removed: isRemoving ? [topicId] : [],
          });
          setEnabledTopicIds(next);
        }}
        onToggleCountry={(countryId) => {
          const isRemoving = preferences.enabledCountryOrRegionIds.includes(countryId);
          const next = isRemoving
            ? preferences.enabledCountryOrRegionIds.filter((id) => id !== countryId)
            : [...preferences.enabledCountryOrRegionIds, countryId];
          track('country_preferences_changed', {
            added: isRemoving ? [] : [countryId],
            removed: isRemoving ? [countryId] : [],
          });
          setEnabledCountryOrRegionIds(next);
        }}
      />
    </>
  );
}

export default App;
