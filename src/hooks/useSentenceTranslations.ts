import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSentenceTranslation } from '../services/generation/lessonsApi';
import type { Lesson } from '../types/lesson';

// Статус перевода предложения в режиме «Перевод». ready — перевод есть (fixture
// в уроке или уже дозагружен); loading — грузим; error — упало; idle — ещё не
// запрашивали (режим только что включён).
export type TranslationStatus = 'idle' | 'loading' | 'ready' | 'error';
export type SentenceTranslation = { status: TranslationStatus; text?: string };

type FetchedState = Record<string, SentenceTranslation>;

async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// Session-кэш переводов предложений по sentence.id. Предзаполненные уроки
// (sampleLesson) несут перевод прямо в sentence.translation — они сразу ready и
// не требуют сети (важно: /api/* нет в `npm run dev`). Для сгенерированных
// уроков перевод догружается лениво, когда включён режим перевода.
export function useSentenceTranslations(
  lesson: Lesson,
  enabled: boolean,
): {
  translations: Map<string, SentenceTranslation>;
  retry: (sentenceId: string) => void;
} {
  const [fetched, setFetched] = useState<FetchedState>({});
  const [retryNonce, setRetryNonce] = useState(0);

  // Сброс кэша при смене урока — переводы предыдущего урока не должны протекать.
  useEffect(() => {
    setFetched({});
  }, [lesson]);

  const sentences = useMemo(
    () => lesson.paragraphs.flatMap((p) => p.sentences),
    [lesson],
  );

  useEffect(() => {
    if (!enabled) return;

    // Фетчим только предложения без fixture-перевода, которые ещё не загружены и
    // не грузятся сейчас.
    const pending = sentences.filter(
      (s) => !s.translation && fetched[s.id]?.status !== 'ready' && fetched[s.id]?.status !== 'loading',
    );
    if (pending.length === 0) return;

    let cancelled = false;
    setFetched((prev) => {
      const next = { ...prev };
      for (const s of pending) next[s.id] = { status: 'loading' };
      return next;
    });

    mapWithConcurrency(pending, 3, async (sentence) => {
      try {
        const text = await fetchSentenceTranslation(sentence.text, lesson.level);
        if (cancelled) return;
        setFetched((prev) => ({ ...prev, [sentence.id]: { status: 'ready', text } }));
      } catch (err) {
        if (cancelled) return;
        console.error(`Не удалось перевести предложение "${sentence.text}":`, err);
        setFetched((prev) => ({ ...prev, [sentence.id]: { status: 'error' } }));
      }
    });

    return () => {
      cancelled = true;
    };
    // retryNonce намеренно в зависимостях — перезапустить фетч после «Повторить».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sentences, lesson, retryNonce]);

  const translations = useMemo(() => {
    const map = new Map<string, SentenceTranslation>();
    for (const sentence of sentences) {
      if (sentence.translation) {
        map.set(sentence.id, { status: 'ready', text: sentence.translation });
      } else {
        map.set(sentence.id, fetched[sentence.id] ?? { status: enabled ? 'loading' : 'idle' });
      }
    }
    return map;
  }, [sentences, fetched, enabled]);

  const retry = useCallback((sentenceId: string) => {
    setFetched((prev) => {
      const next = { ...prev };
      delete next[sentenceId];
      return next;
    });
    setRetryNonce((n) => n + 1);
  }, []);

  return { translations, retry };
}
