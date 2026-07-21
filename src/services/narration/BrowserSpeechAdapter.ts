import type { Lesson } from '../../types/lesson';
import { buildLessonText, findTokenAtOffset, type TokenSpan } from '../../lib/lessonText';
import type { NarrationAdapter } from './NarrationAdapter';

// Средняя скорость чтения для приблизительной синхронизации, симв/сек при rate=1.
const FALLBACK_CHARS_PER_SECOND = 15;

export class BrowserSpeechAdapter implements NarrationAdapter {
  private readonly text: string;
  private readonly spans: TokenSpan[];
  private rate = 1;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private hasRealBoundaryForCurrentUtterance = false;
  private fallbackTimers: number[] = [];
  private tokenChangeCb: ((tokenId: string) => void) | null = null;
  private completeCb: (() => void) | null = null;
  private errorCb: ((error: Error) => void) | null = null;

  constructor(lesson: Lesson) {
    const built = buildLessonText(lesson);
    this.text = built.text;
    this.spans = built.spans;
  }

  playFrom(tokenId: string, rate: number): void {
    const span = this.spans.find((s) => s.tokenId === tokenId);
    this.speakFrom(span ? span.start : 0, rate);
  }

  pause(): void {
    this.clearFallbackTimers();
    this.currentUtterance = null;
    if (this.isSupported()) window.speechSynthesis.cancel();
  }

  stop(): void {
    this.clearFallbackTimers();
    this.currentUtterance = null;
    if (this.isSupported()) window.speechSynthesis.cancel();
  }

  // Ошибка точечного прослушивания идёт в собственный onError, не в общий
  // errorCb — не должна ломать основное чтение (см. PrecomputedAudioAdapter).
  speakSelection(text: string, rate = this.rate, onError?: (error: Error) => void): void {
    if (!this.isSupported()) {
      onError?.(new Error('speech-unsupported'));
      return;
    }
    // Прослушивание отдельного слова/фразы/предложения — самостоятельное
    // действие, не должно триггерить onComplete основного чтения.
    this.clearFallbackTimers();
    this.currentUtterance = null;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = rate;
    utterance.onerror = (event) => {
      const code = (event as SpeechSynthesisErrorEvent).error;
      if (code === 'canceled' || code === 'interrupted') return;
      onError?.(new Error(code || 'speech-error'));
    };
    window.speechSynthesis.speak(utterance);
  }

  setRate(rate: number): void {
    this.rate = rate;
  }

  onTokenChange(callback: (tokenId: string) => void): void {
    this.tokenChangeCb = callback;
  }

  onComplete(callback: () => void): void {
    this.completeCb = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCb = callback;
  }

  private isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  private speakFrom(startOffset: number, rate: number): void {
    if (!this.isSupported()) {
      this.errorCb?.(new Error('speech-unsupported'));
      return;
    }

    this.clearFallbackTimers();
    this.currentUtterance = null;
    this.hasRealBoundaryForCurrentUtterance = false;
    window.speechSynthesis.cancel();
    this.rate = rate;

    const utteranceText = this.text.slice(startOffset);
    if (!utteranceText.trim()) {
      this.completeCb?.();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(utteranceText);
    utterance.lang = 'fr-FR';
    utterance.rate = rate;

    utterance.onboundary = (event) => {
      if (this.currentUtterance !== utterance) return; // событие от уже сменённого утеранса
      if (event.name && event.name !== 'word') return;
      if (!this.hasRealBoundaryForCurrentUtterance) {
        // Реальные события пошли — резервный таймер больше не нужен и не
        // должен вмешиваться (иначе устаревший тик может отбросить подсветку
        // на пару слов назад на долю секунды).
        this.hasRealBoundaryForCurrentUtterance = true;
        this.clearFallbackTimers();
      }
      const token = findTokenAtOffset(this.spans, startOffset + event.charIndex);
      if (token) this.tokenChangeCb?.(token.tokenId);
    };
    utterance.onend = () => {
      if (this.currentUtterance !== utterance) return; // сняли/заменили раньше, чем реально закончилось
      this.clearFallbackTimers();
      this.completeCb?.();
    };
    utterance.onerror = (event) => {
      if (this.currentUtterance !== utterance) return;
      const code = (event as SpeechSynthesisErrorEvent).error;
      if (code === 'canceled' || code === 'interrupted') return;
      this.errorCb?.(new Error(code || 'speech-error'));
    };

    this.currentUtterance = utterance;
    this.scheduleFallbackHighlighting(utterance, startOffset, rate);
    window.speechSynthesis.speak(utterance);
  }

  // Раздел 14 ТЗ, "резервный вариант синхронизации": если браузер не шлёт
  // надёжные word-boundary события, подсветка приблизительно продвигается по
  // расписанию, построенному на длине токенов. Это демонстрационная
  // синхронизация, а не точный тайминг реального произнесения.
  private scheduleFallbackHighlighting(
    utterance: SpeechSynthesisUtterance,
    startOffset: number,
    rate: number,
  ): void {
    const charsPerSecond = FALLBACK_CHARS_PER_SECOND * rate;
    const upcoming = this.spans.filter((s) => s.start >= startOffset);

    for (const span of upcoming) {
      const estimatedMs = ((span.start - startOffset) / charsPerSecond) * 1000;
      const timerId = window.setTimeout(() => {
        if (this.currentUtterance !== utterance) return;
        if (this.hasRealBoundaryForCurrentUtterance) return;
        this.tokenChangeCb?.(span.tokenId);
      }, estimatedMs);
      this.fallbackTimers.push(timerId);
    }
  }

  private clearFallbackTimers(): void {
    this.fallbackTimers.forEach((id) => window.clearTimeout(id));
    this.fallbackTimers = [];
  }
}
