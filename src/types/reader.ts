export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'stopped' | 'completed' | 'error';

export type ReaderState = {
  playbackStatus: PlaybackStatus;
  activeTokenId: string | null;
  playbackAnchorTokenId: string | null;
  selectedTokenId: string | null;
  selectedAnnotationId: string | null;
  rate: number;
  isSheetOpen: boolean;
  isGrammarExpanded: boolean;
};

export type ReaderTheme = 'light' | 'dark';

export type ArticleFontSize = 'small' | 'medium' | 'large';

export type ReaderPreferences = {
  theme: ReaderTheme;
  fontSize: ArticleFontSize;
  translationMode: boolean;
};
