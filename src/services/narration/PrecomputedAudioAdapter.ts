import type { Lesson } from '../../types/lesson';
import { buildLessonText, findTokenAtOffset, type TokenSpan } from '../../lib/lessonText';
import type { NarrationAdapter } from './NarrationAdapter';

const AUDIO_SRC = '/audio/lesson-fr.mp3';

type TimedSpan = { tokenId: string; startTime: number; endTime: number };

// Production-путь из раздела 14 ТЗ: заранее сгенерированный аудиофайл +
// word-level timestamps (см. scripts/generate-lesson-audio.ts) вместо
// браузерного синтеза. React/остальной адаптерный слой об этом не знает —
// достаточно того, что класс реализует тот же NarrationAdapter.
export class PrecomputedAudioAdapter implements NarrationAdapter {
  private readonly audio: HTMLAudioElement;
  private readonly timedSpans: TimedSpan[];
  private readonly lessonText: string;
  private readonly textSpans: TokenSpan[];
  private tokenChangeCb: ((tokenId: string) => void) | null = null;
  private completeCb: (() => void) | null = null;
  private errorCb: ((error: Error) => void) | null = null;
  private lastReportedTokenId: string | null = null;
  private mode: 'reading' | 'selection' = 'reading';
  private selectionEndTime: number | null = null;

  constructor(lesson: Lesson) {
    this.audio = new Audio(AUDIO_SRC);
    const built = buildLessonText(lesson);
    this.lessonText = built.text;
    this.textSpans = built.spans;
    this.timedSpans = collectTimedSpans(lesson);

    this.audio.addEventListener('timeupdate', this.handleTimeUpdate);
    this.audio.addEventListener('ended', () => {
      if (this.mode === 'reading') this.completeCb?.();
    });
    this.audio.addEventListener('error', () => {
      this.errorCb?.(new Error('audio-unavailable'));
    });
  }

  playFrom(tokenId: string, rate: number): void {
    const span = this.timedSpans.find((s) => s.tokenId === tokenId);
    this.mode = 'reading';
    this.selectionEndTime = null;
    this.lastReportedTokenId = null;
    this.audio.playbackRate = rate;
    this.audio.currentTime = span ? span.startTime : 0;
    void this.audio.play().catch((error: Error) => this.errorCb?.(error));
  }

  pause(): void {
    this.audio.pause();
  }

  stop(): void {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.lastReportedTokenId = null;
  }

  // Прослушивание слова/фразы/предложения — та же дорожка, короткий отрезок
  // по таймкодам, найденным через совпадение текста (раздел 14 контракт
  // принимает текст, а не id токенов — ищем его в каноническом тексте урока).
  speakSelection(text: string, rate = this.audio.playbackRate || 1): void {
    const idx = this.lessonText.indexOf(text);
    if (idx === -1) {
      this.errorCb?.(new Error('selection-not-found'));
      return;
    }
    const startSpan = findTokenAtOffset(this.textSpans, idx);
    const endSpan = findTokenAtOffset(this.textSpans, idx + text.length - 1);
    const startTimed = startSpan && this.timedSpans.find((s) => s.tokenId === startSpan.tokenId);
    const endTimed = endSpan && this.timedSpans.find((s) => s.tokenId === endSpan.tokenId);
    if (!startTimed || !endTimed) {
      this.errorCb?.(new Error('selection-timing-missing'));
      return;
    }
    this.mode = 'selection';
    this.selectionEndTime = endTimed.endTime;
    this.audio.playbackRate = rate;
    this.audio.currentTime = startTimed.startTime;
    void this.audio.play().catch((error: Error) => this.errorCb?.(error));
  }

  setRate(rate: number): void {
    this.audio.playbackRate = rate;
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

  private handleTimeUpdate = (): void => {
    if (this.mode === 'selection') {
      if (this.selectionEndTime !== null && this.audio.currentTime >= this.selectionEndTime) {
        this.audio.pause();
        this.mode = 'reading';
        this.selectionEndTime = null;
      }
      return; // не двигаем подсветку основного чтения во время предпрослушивания
    }
    const current = this.timedSpans.find(
      (s) => this.audio.currentTime >= s.startTime && this.audio.currentTime < s.endTime,
    );
    if (current && current.tokenId !== this.lastReportedTokenId) {
      this.lastReportedTokenId = current.tokenId;
      this.tokenChangeCb?.(current.tokenId);
    }
  };
}

function collectTimedSpans(lesson: Lesson): TimedSpan[] {
  const spans: TimedSpan[] = [];
  for (const paragraph of lesson.paragraphs) {
    for (const sentence of paragraph.sentences) {
      for (const token of sentence.tokens) {
        if (token.startTime !== undefined && token.endTime !== undefined) {
          spans.push({ tokenId: token.id, startTime: token.startTime, endTime: token.endTime });
        }
      }
    }
  }
  return spans;
}
