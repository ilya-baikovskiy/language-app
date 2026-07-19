import { useCallback, useEffect, useState } from 'react';
import { sampleLesson } from '../data/sampleLesson';
import { useReaderPreferences } from '../hooks/useReaderPreferences';
import { useSelectedAnnotation } from '../hooks/useSelectedAnnotation';
import type { ReaderState } from '../types/reader';
import { ReaderHeader } from './ReaderHeader';
import { ArticleContent } from './ArticleContent';
import { NarrationPlayer } from './NarrationPlayer';
import { ExplanationSheet } from './ExplanationSheet';

const INITIAL_READER_STATE: ReaderState = {
  playbackStatus: 'idle',
  activeTokenId: null,
  playbackAnchorTokenId: null,
  selectedTokenId: null,
  selectedAnnotationId: null,
  rate: 1,
  isSheetOpen: false,
  isGrammarExpanded: false,
};

export function ReaderPage() {
  const { theme, setTheme, fontSize, setFontSize } = useReaderPreferences();
  const [readerState, setReaderState] = useState<ReaderState>(INITIAL_READER_STATE);

  const sheetSelection = useSelectedAnnotation(
    sampleLesson,
    readerState.selectedTokenId,
    readerState.selectedAnnotationId,
  );

  // Раздел 17 ТЗ (handleTokenClick), без паузы озвучки — она появится в Этапе 3
  // вместе с самой озвучкой (пока паузить нечего).
  const handleSelectGroup = useCallback((tokenId: string, annotationId: string | null) => {
    setReaderState((prev) => ({
      ...prev,
      selectedTokenId: tokenId,
      selectedAnnotationId: annotationId,
      playbackAnchorTokenId: tokenId,
      isSheetOpen: true,
    }));
  }, []);

  const closeSheet = useCallback(() => {
    setReaderState((prev) => ({ ...prev, isSheetOpen: false }));
  }, []);

  useEffect(() => {
    if (!readerState.isSheetOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeSheet();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [readerState.isSheetOpen, closeSheet]);

  useEffect(() => {
    if (!readerState.isSheetOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [readerState.isSheetOpen]);

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
        selectedAnnotationId={readerState.selectedAnnotationId}
        selectedTokenId={readerState.selectedTokenId}
        onSelectGroup={handleSelectGroup}
      />

      {readerState.playbackStatus === 'idle' ? (
        <button className="fab-play" type="button" aria-label="Слушать">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      ) : (
        <NarrationPlayer />
      )}

      <ExplanationSheet
        selection={sheetSelection}
        isOpen={readerState.isSheetOpen}
        onClose={closeSheet}
        onContinue={closeSheet}
      />
    </div>
  );
}
