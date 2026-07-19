// Раздел 14 ТЗ — контракт озвучки, отделённый от React. MVP-реализация —
// BrowserSpeechAdapter (Web Speech API); позже заменяется на предзаписанный
// аудиофайл + word-level timestamps без изменений в компонентах.
export interface NarrationAdapter {
  playFrom(tokenId: string, rate: number): void;
  pause(): void;
  stop(): void;
  speakSelection(text: string, rate?: number): void;
  setRate(rate: number): void;
  onTokenChange(callback: (tokenId: string) => void): void;
  onComplete(callback: () => void): void;
  onError(callback: (error: Error) => void): void;
}
