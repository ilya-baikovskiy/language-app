import type { Lesson } from '../../types/lesson';
import { buildLessonText, findTokenAtOffset, type TokenSpan } from '../../lib/lessonText';
import type { NarrationAdapter } from './NarrationAdapter';

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
  private selectionTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(lesson: Lesson, audioSrc: string) {
    this.audio = new Audio(audioSrc);
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
    this.clearSelectionTimer();
    this.mode = 'reading';
    this.lastReportedTokenId = null;
    this.audio.playbackRate = rate;
    this.audio.currentTime = span ? span.startTime : 0;
    void this.audio.play().catch((error: Error) => this.errorCb?.(error));
  }

  pause(): void {
    this.clearSelectionTimer();
    this.audio.pause();
  }

  stop(): void {
    this.clearSelectionTimer();
    this.audio.pause();
    this.audio.currentTime = 0;
    this.lastReportedTokenId = null;
  }

  // Прослушивание слова/фразы/предложения — та же дорожка, короткий отрезок
  // по таймкодам, найденным через совпадение текста (раздел 14 контракт
  // принимает текст, а не id токенов — ищем его в каноническом тексте урока).
  // Регистронезависимый поиск: сгенерированный displayText/сущность могут не
  // совпадать по регистру с тем, как слово стоит в реальном тексте урока.
  //
  // contextText сужает поиск текста до конкретного предложения: короткое/частое
  // слово (артикль, местоимение, "les"/"et"/"elle"...) без этого может встретиться
  // в уроке много раз, и indexOf по всему тексту найдёт ПЕРВОЕ вхождение — не то,
  // что реально кликнули, из-за чего звучит не то слово или таймкод не находится.
  // Предложение почти всегда уникально в уроке, поэтому сначала ищем его, потом
  // слово — только внутри найденного диапазона.
  //
  // Ошибки здесь идут в собственный onError-колбэк, а не в общий errorCb:
  // один неудачный точечный клик (текст не нашёлся/нет таймкода) — это
  // локальный сбой конкретной кнопки, он не должен переводить весь плеер в
  // состояние error и блокировать обычное чтение урока.
  speakSelection(
    text: string,
    rate = this.audio.playbackRate || 1,
    onError?: (error: Error) => void,
    contextText?: string,
  ): void {
    const haystack = this.lessonText.toLowerCase();
    const needle = text.toLowerCase();
    let idx: number;
    if (contextText) {
      const ctxIdx = haystack.indexOf(contextText.toLowerCase());
      const withinCtx = ctxIdx !== -1 ? haystack.indexOf(needle, ctxIdx) : -1;
      idx = withinCtx !== -1 && withinCtx < ctxIdx + contextText.length ? withinCtx : -1;
    } else {
      idx = haystack.indexOf(needle);
    }
    if (idx === -1) {
      onError?.(new Error('selection-not-found'));
      return;
    }
    const startSpan = findTokenAtOffset(this.textSpans, idx);
    const endSpan = findTokenAtOffset(this.textSpans, idx + text.length - 1);
    const startTimed = startSpan && this.timedSpans.find((s) => s.tokenId === startSpan.tokenId);
    const endTimed = endSpan && this.timedSpans.find((s) => s.tokenId === endSpan.tokenId);
    if (!startTimed || !endTimed) {
      onError?.(new Error('selection-timing-missing'));
      return;
    }
    this.clearSelectionTimer();
    this.mode = 'selection';
    this.audio.playbackRate = rate;
    this.audio.currentTime = startTimed.startTime;
    // Точная остановка по таймеру, а не по 'timeupdate': браузер не гарантирует
    // частоту этого события (может быть до ~250мс между тиками), из-за чего
    // отрезок останавливался с непредсказуемым "хвостом" лишнего звука каждый
    // раз по-разному. setTimeout с длительностью отрезка — намного точнее.
    const durationMs = Math.max(0, ((endTimed.endTime - startTimed.startTime) / rate) * 1000);
    this.selectionTimer = setTimeout(() => {
      this.audio.pause();
      this.mode = 'reading';
      this.selectionTimer = null;
    }, durationMs);
    void this.audio.play().catch((error: Error) => onError?.(error));
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

  private clearSelectionTimer(): void {
    if (this.selectionTimer !== null) {
      clearTimeout(this.selectionTimer);
      this.selectionTimer = null;
    }
  }

  private handleTimeUpdate = (): void => {
    if (this.mode === 'selection') {
      return; // не двигаем подсветку основного чтения во время предпрослушивания; остановку делает selectionTimer
    }
    // Не ищем токен, строго содержащий currentTime — короткие служебные слова
    // (de, un, et…) иногда короче интервала между двумя событиями timeupdate
    // (браузер шлёт их не на каждый кадр), и такое окно проматывается целиком
    // между двумя тиками, слово никогда не подсвечивается. Вместо этого берём
    // последнее слово, чьё startTime уже наступило — так у каждого слова есть
    // момент, когда оно становится «текущим», даже если endTime уже проехали.
    const current = findLastStartedSpan(this.timedSpans, this.audio.currentTime);
    if (current && current.tokenId !== this.lastReportedTokenId) {
      this.lastReportedTokenId = current.tokenId;
      this.tokenChangeCb?.(current.tokenId);
    }
  };
}

// timedSpans отсортирован по startTime по построению (порядок чтения ==
// порядок таймкодов), поэтому достаточно один раз пройти с конца.
function findLastStartedSpan(spans: TimedSpan[], time: number): TimedSpan | undefined {
  for (let i = spans.length - 1; i >= 0; i--) {
    if (spans[i].startTime <= time) return spans[i];
  }
  return undefined;
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
