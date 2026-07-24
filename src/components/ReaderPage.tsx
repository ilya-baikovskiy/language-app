import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReaderPreferences } from '../hooks/useReaderPreferences';
import { useSelectedAnnotation } from '../hooks/useSelectedAnnotation';
import { useSentenceTranslations } from '../hooks/useSentenceTranslations';
import { useSavedWords } from '../hooks/useSavedWords';
import { useNarration } from '../hooks/useNarration';
import { useUnitPronunciation } from '../hooks/useUnitPronunciation';
import { findTokenAndSentence, findTokenText, orderedWordTokenIds } from '../lib/lessonText';
import { track } from '../content-system/analytics/eventClient';
import type { LessonEntryPoint, ProgressMilestone } from '../content-system/analyticsEvent';
import type { LanguageCode } from '../../lib/pipeline/languageConfig';
import type { Lesson } from '../types/lesson';
import { ReaderHeader } from './ReaderHeader';
import { ArticleContent } from './ArticleContent';
import { NarrationPlayer } from './NarrationPlayer';
import { ExplanationSheet } from './ExplanationSheet';

const PROGRESS_MILESTONES: ProgressMilestone[] = [10, 25, 50, 75, 90, 100];

type SelectionState = {
  selectedTokenId: string | null;
  isSheetOpen: boolean;
};

const INITIAL_SELECTION: SelectionState = {
  selectedTokenId: null,
  isSheetOpen: false,
};

const SPEAKING_STATUSES = new Set(['playing', 'paused']);
const FAB_STATUSES = new Set(['idle', 'stopped']);
const PLAYER_STATUSES = new Set(['playing', 'paused', 'completed']);

type Props = {
  lesson: Lesson;
  audioSrc: string;
  onBack?: () => void;
  // PR 4 (05 §8 lesson_opened) — прокинуто из App.tsx, см. комментарий у View
  // в App.tsx про то, откуда берётся каждое значение.
  entryPoint: LessonEntryPoint;
  appActiveLanguage: LanguageCode;
};

export function ReaderPage({ lesson, audioSrc, onBack, entryPoint, appActiveLanguage }: Props) {
  const { theme, setTheme, fontSize, setFontSize, translationMode, setTranslationMode } = useReaderPreferences();
  const narration = useNarration(lesson, audioSrc);
  const unitPronunciation = useUnitPronunciation(
    (lesson.languageCode as LanguageCode | undefined) ?? 'fr',
    lesson.audioProvider ?? 'openai',
  );
  const [selection, setSelection] = useState<SelectionState>(INITIAL_SELECTION);

  const { translations, retry: retryTranslation } = useSentenceTranslations(lesson, translationMode);
  const { isSaved, toggleSave } = useSavedWords();

  const wordTokenIds = useMemo(() => orderedWordTokenIds(lesson), [lesson]);
  const progress = narration.activeTokenId
    ? (wordTokenIds.indexOf(narration.activeTokenId) + 1) / wordTokenIds.length
    : 0;

  // --- Tracking (PR 4) — see final report for what's approximated here. ---
  const lessonStartedRef = useRef(false);
  const sheetOpenedAtRef = useRef<number | null>(null);
  const lessonOpenedAtRef = useRef(Date.now());
  const activePlayMsRef = useRef(0);
  const playStartedAtRef = useRef<number | null>(null);
  const reachedMilestonesRef = useRef<Set<ProgressMilestone>>(new Set());

  const markLessonStarted = useCallback(() => {
    if (lessonStartedRef.current) return;
    lessonStartedRef.current = true;
    track('lesson_started', {}, { lessonId: lesson.id, language: appActiveLanguage });
  }, [lesson.id, appActiveLanguage]);

  // lesson_opened — once per mount/lesson (05 §8).
  useEffect(() => {
    track(
      'lesson_opened',
      { entryPoint, appActiveLanguage, lessonLanguage: (lesson.languageCode as LanguageCode | undefined) ?? 'fr' },
      { lessonId: lesson.id, language: appActiveLanguage },
    );
    lessonOpenedAtRef.current = Date.now();
    activePlayMsRef.current = 0;
    playStartedAtRef.current = null;
    lessonStartedRef.current = false;
    reachedMilestonesRef.current = new Set();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);

  // Approximates "active reading time" as time spent with playbackStatus
  // 'playing' — the only per-second signal already tracked by useNarration.
  // Must run before the lesson_completed effect below (React runs effects in
  // declaration order) so activePlayMsRef is flushed by the time it reads it.
  useEffect(() => {
    if (narration.playbackStatus === 'playing') {
      if (playStartedAtRef.current === null) playStartedAtRef.current = Date.now();
    } else if (playStartedAtRef.current !== null) {
      activePlayMsRef.current += Date.now() - playStartedAtRef.current;
      playStartedAtRef.current = null;
    }
  }, [narration.playbackStatus]);

  // lesson_completed — only the 'reached_end' path exists in this player
  // (there is no explicit "mark as done" button, see PROGRESS.md/ReaderPage —
  // stop() produces 'stopped', not 'completed').
  useEffect(() => {
    if (narration.playbackStatus !== 'completed') return;
    track(
      'lesson_completed',
      {
        completionMethod: 'reached_end',
        activeReadingSeconds: Math.round(activePlayMsRef.current / 1000),
        elapsedSeconds: Math.round((Date.now() - lessonOpenedAtRef.current) / 1000),
      },
      { lessonId: lesson.id, language: appActiveLanguage },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narration.playbackStatus, lesson.id]);

  // lesson_progress milestones — approximated from the same `progress`
  // (fraction of word tokens reached via activeTokenId) already computed
  // above for the player's progress bar, not a new parallel tracker.
  useEffect(() => {
    const pct = Math.round(progress * 100);
    for (const milestone of PROGRESS_MILESTONES) {
      if (pct >= milestone && !reachedMilestonesRef.current.has(milestone)) {
        reachedMilestonesRef.current.add(milestone);
        track('lesson_progress', { milestone }, { lessonId: lesson.id, language: appActiveLanguage });
      }
    }
  }, [progress, lesson.id, appActiveLanguage]);

  const {
    selection: sheetSelection,
    retry: retryAnnotation,
    loadDetails,
    retryDetails,
  } = useSelectedAnnotation(lesson, selection.selectedTokenId);

  // Bottom Sheet v2 — каждый токен кликабелен сам по себе, annotation.id ===
  // token.id (нет больше отдельного annotationId группы). Текст для прогрева
  // клипа (см. useUnitPronunciation.prefetch) — просто text самого токена:
  // audioText в объяснении всегда равен ему же, гадать по AI-ответу не нужно.
  const handleSelectToken = useCallback(
    (tokenId: string) => {
      markLessonStarted();
      narration.inspectToken(tokenId);
      setSelection({ selectedTokenId: tokenId, isSheetOpen: true });
      sheetOpenedAtRef.current = Date.now();

      const found = findTokenAndSentence(lesson, tokenId);
      track(
        'token_tapped',
        { tokenId, sentenceId: found?.sentence.id ?? '', annotationType: 'word' },
        { lessonId: lesson.id, language: appActiveLanguage },
      );

      const prefetchText = findTokenText(lesson, tokenId);
      if (prefetchText) unitPronunciation.prefetch(prefetchText);
    },
    [narration, lesson, unitPronunciation, markLessonStarted, appActiveLanguage],
  );

  const closeSheet = useCallback(() => {
    setSelection((prev) => ({ ...prev, isSheetOpen: false }));
  }, []);

  const handleLoadDetails = useCallback(() => {
    if (selection.selectedTokenId) {
      track(
        'annotation_details_opened',
        {
          tokenId: selection.selectedTokenId,
          timeSinceSheetOpenMs: sheetOpenedAtRef.current ? Date.now() - sheetOpenedAtRef.current : 0,
        },
        { lessonId: lesson.id, language: appActiveLanguage },
      );
    }
    loadDetails();
  }, [selection.selectedTokenId, loadDetails, lesson.id, appActiveLanguage]);

  const handleContinueFromSelection = useCallback(() => {
    if (selection.selectedTokenId) narration.continueFrom(selection.selectedTokenId);
    closeSheet();
  }, [selection.selectedTokenId, narration, closeSheet]);

  const handleTogglePlay = useCallback(() => {
    if (narration.playbackStatus === 'playing') {
      narration.pause();
    } else {
      markLessonStarted();
      narration.play();
    }
  }, [narration, markLessonStarted]);

  const handlePlayFromFab = useCallback(() => {
    markLessonStarted();
    narration.play();
  }, [narration, markLessonStarted]);

  const handleTranslationModeChange = useCallback(
    (on: boolean) => {
      track(
        'sentence_translation_toggled',
        { enabled: on, scope: 'lesson', currentProgress: progress },
        { lessonId: lesson.id, language: appActiveLanguage },
      );
      setTranslationMode(on);
    },
    [setTranslationMode, progress, lesson.id, appActiveLanguage],
  );

  // Слово/фраза — отдельный клип (useUnitPronunciation), с запасным вариантом
  // на нарезку дорожки урока, если клип не получился (сеть/квота). Нарезка
  // сработает только для текста, который дословно есть в уроке — для форм/
  // разборов фраз (их в аудио нет вообще) сработает только клип.
  //
  // Решение по итогам A/B (см. PROGRESS.md): даже с точными границами токенов
  // (edge-snap фикс) нарезка звучит хуже клипа — коартикуляция соседних слов
  // никакой точностью таймингов не лечится, это свойство слитной речи, не
  // ошибка данных. Клип — постоянное решение, не временный вариант.
  const handleSpeakUnit = useCallback(
    (text: string, onError?: (error: Error) => void, contextText?: string) => {
      unitPronunciation.speak(text, () => narration.speakSelection(text, onError, contextText));
    },
    [unitPronunciation, narration],
  );

  const savedAnnotation = sheetSelection?.kind === 'annotation' ? sheetSelection.annotation : null;
  const isCurrentSaved = savedAnnotation ? isSaved(lesson.id, savedAnnotation.id) : false;
  const handleToggleSave = useCallback(() => {
    if (!savedAnnotation) return;
    const wasSaved = isSaved(lesson.id, savedAnnotation.id);
    const { summary } = savedAnnotation;
    toggleSave({
      lessonId: lesson.id,
      tokenId: savedAnnotation.id,
      language: appActiveLanguage,
      level: lesson.level,
      surfaceForm: summary.displayForm,
      partOfSpeech: summary.partOfSpeech,
      translation: summary.translation,
      audioText: summary.audioText,
      contextSource: summary.context.selectedSource,
      contextTranslation: summary.context.selectedTranslation,
    });
    // Only tracked on save, not on un-save (05 §9 only defines
    // `learning_unit_saved` — there is no matching "unsaved" event name to
    // use instead of inventing one, see brief §PR 4).
    if (!wasSaved) {
      track('learning_unit_saved', { tokenId: savedAnnotation.id, unitType: 'word' }, { lessonId: lesson.id, language: appActiveLanguage });
    }
  }, [savedAnnotation, lesson.id, lesson.level, toggleSave, isSaved, appActiveLanguage]);

  useEffect(() => {
    if (!selection.isSheetOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeSheet();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selection.isSheetOpen, closeSheet]);

  useEffect(() => {
    if (!selection.isSheetOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selection.isSheetOpen]);

  // Смена урока (например, из библиотеки) — состояние выбора слова не должно
  // тянуться из предыдущего урока.
  useEffect(() => {
    setSelection(INITIAL_SELECTION);
  }, [lesson]);

  return (
    <div className="app">
      <ReaderHeader
        lesson={lesson}
        theme={theme}
        onThemeChange={setTheme}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        translationMode={translationMode}
        onTranslationModeChange={handleTranslationModeChange}
        onBack={onBack}
      />

      <ArticleContent
        lesson={lesson}
        selectedTokenId={selection.selectedTokenId}
        activeTokenId={SPEAKING_STATUSES.has(narration.playbackStatus) ? narration.activeTokenId : null}
        onSelectToken={handleSelectToken}
        translationMode={translationMode}
        translations={translations}
        onRetryTranslation={retryTranslation}
      />

      {FAB_STATUSES.has(narration.playbackStatus) && (
        <button className="fab-play" type="button" aria-label="Слушать" onClick={handlePlayFromFab}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      )}

      {narration.playbackStatus === 'error' && (
        <p className="tts-error-note" role="status">
          Озвучивание недоступно в этом браузере — текст и объяснения по-прежнему доступны.
        </p>
      )}

      {PLAYER_STATUSES.has(narration.playbackStatus) && (
        <NarrationPlayer
          status={narration.playbackStatus}
          progress={progress}
          rate={narration.rate}
          onTogglePlay={handleTogglePlay}
          onStop={narration.stop}
          onRateChange={narration.setRate}
          onReplay={narration.replay}
        />
      )}

      <ExplanationSheet
        selection={sheetSelection}
        isOpen={selection.isSheetOpen}
        onClose={closeSheet}
        onContinue={handleContinueFromSelection}
        onSpeak={narration.speakSelection}
        onSpeakUnit={handleSpeakUnit}
        isUnitLoading={unitPronunciation.isLoading}
        onRetry={retryAnnotation}
        onLoadDetails={handleLoadDetails}
        onRetryDetails={retryDetails}
        isSaved={isCurrentSaved}
        onToggleSave={handleToggleSave}
      />
    </div>
  );
}
