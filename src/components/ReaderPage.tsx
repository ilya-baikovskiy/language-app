import { useCallback, useEffect, useMemo, useState } from 'react';
import { useReaderPreferences } from '../hooks/useReaderPreferences';
import { useSelectedAnnotation } from '../hooks/useSelectedAnnotation';
import { useSentenceTranslations } from '../hooks/useSentenceTranslations';
import { useSavedUnits } from '../hooks/useSavedUnits';
import { useNarration } from '../hooks/useNarration';
import { useUnitPronunciation } from '../hooks/useUnitPronunciation';
import { findTokenText, orderedWordTokenIds } from '../lib/lessonText';
import type { LanguageCode } from '../../lib/pipeline/languageConfig';
import type { Lesson } from '../types/lesson';
import { ReaderHeader } from './ReaderHeader';
import { ArticleContent } from './ArticleContent';
import { NarrationPlayer } from './NarrationPlayer';
import { ExplanationSheet } from './ExplanationSheet';

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
};

export function ReaderPage({ lesson, audioSrc, onBack }: Props) {
  const { theme, setTheme, fontSize, setFontSize, translationMode, setTranslationMode } = useReaderPreferences();
  const narration = useNarration(lesson, audioSrc);
  const unitPronunciation = useUnitPronunciation(
    (lesson.languageCode as LanguageCode | undefined) ?? 'fr',
    lesson.audioProvider ?? 'openai',
  );
  const [selection, setSelection] = useState<SelectionState>(INITIAL_SELECTION);

  const { translations, retry: retryTranslation } = useSentenceTranslations(lesson, translationMode);
  const { isSaved, toggleSave } = useSavedUnits();

  const wordTokenIds = useMemo(() => orderedWordTokenIds(lesson), [lesson]);
  const progress = narration.activeTokenId
    ? (wordTokenIds.indexOf(narration.activeTokenId) + 1) / wordTokenIds.length
    : 0;

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
      narration.inspectToken(tokenId);
      setSelection({ selectedTokenId: tokenId, isSheetOpen: true });

      const prefetchText = findTokenText(lesson, tokenId);
      if (prefetchText) unitPronunciation.prefetch(prefetchText);
    },
    [narration, lesson, unitPronunciation],
  );

  const closeSheet = useCallback(() => {
    setSelection((prev) => ({ ...prev, isSheetOpen: false }));
  }, []);

  const handleContinueFromSelection = useCallback(() => {
    if (selection.selectedTokenId) narration.continueFrom(selection.selectedTokenId);
    closeSheet();
  }, [selection.selectedTokenId, narration, closeSheet]);

  const handleTogglePlay = useCallback(() => {
    if (narration.playbackStatus === 'playing') narration.pause();
    else narration.play();
  }, [narration]);

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
    toggleSave({
      lessonId: lesson.id,
      tokenId: savedAnnotation.id,
      displayText: savedAnnotation.summary.displayForm,
      shortTranslation: savedAnnotation.summary.translation,
    });
  }, [savedAnnotation, lesson.id, toggleSave]);

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
        onTranslationModeChange={setTranslationMode}
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
        <button className="fab-play" type="button" aria-label="Слушать" onClick={narration.play}>
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
        onLoadDetails={loadDetails}
        onRetryDetails={retryDetails}
        isSaved={isCurrentSaved}
        onToggleSave={handleToggleSave}
      />
    </div>
  );
}
