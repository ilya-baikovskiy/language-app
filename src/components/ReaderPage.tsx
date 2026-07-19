import { useCallback, useEffect, useMemo, useState } from 'react';
import { sampleLesson } from '../data/sampleLesson';
import { useReaderPreferences } from '../hooks/useReaderPreferences';
import { useSelectedAnnotation } from '../hooks/useSelectedAnnotation';
import { useNarration } from '../hooks/useNarration';
import { orderedWordTokenIds } from '../lib/lessonText';
import { ReaderHeader } from './ReaderHeader';
import { ArticleContent } from './ArticleContent';
import { NarrationPlayer } from './NarrationPlayer';
import { ExplanationSheet } from './ExplanationSheet';

type SelectionState = {
  selectedTokenId: string | null;
  selectedAnnotationId: string | null;
  isSheetOpen: boolean;
};

const INITIAL_SELECTION: SelectionState = {
  selectedTokenId: null,
  selectedAnnotationId: null,
  isSheetOpen: false,
};

const SPEAKING_STATUSES = new Set(['playing', 'paused']);
const FAB_STATUSES = new Set(['idle', 'stopped']);
const PLAYER_STATUSES = new Set(['playing', 'paused', 'completed']);

export function ReaderPage() {
  const { theme, setTheme, fontSize, setFontSize } = useReaderPreferences();
  const narration = useNarration(sampleLesson);
  const [selection, setSelection] = useState<SelectionState>(INITIAL_SELECTION);

  const wordTokenIds = useMemo(() => orderedWordTokenIds(sampleLesson), []);
  const progress = narration.activeTokenId
    ? (wordTokenIds.indexOf(narration.activeTokenId) + 1) / wordTokenIds.length
    : 0;

  const sheetSelection = useSelectedAnnotation(sampleLesson, selection.selectedTokenId, selection.selectedAnnotationId);

  const handleSelectGroup = useCallback(
    (tokenId: string, annotationId: string | null) => {
      narration.inspectToken(tokenId);
      setSelection({ selectedTokenId: tokenId, selectedAnnotationId: annotationId, isSheetOpen: true });
    },
    [narration],
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

  return (
    <div className="app">
      <ReaderHeader
        lesson={sampleLesson}
        theme={theme}
        onThemeChange={setTheme}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
      />

      <ArticleContent
        lesson={sampleLesson}
        selectedAnnotationId={selection.selectedAnnotationId}
        selectedTokenId={selection.selectedTokenId}
        activeTokenId={SPEAKING_STATUSES.has(narration.playbackStatus) ? narration.activeTokenId : null}
        onSelectGroup={handleSelectGroup}
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
          onCycleRate={narration.cycleRate}
          onReplay={narration.replay}
        />
      )}

      <ExplanationSheet
        selection={sheetSelection}
        isOpen={selection.isSheetOpen}
        onClose={closeSheet}
        onContinue={handleContinueFromSelection}
        onSpeak={narration.speakSelection}
      />
    </div>
  );
}
