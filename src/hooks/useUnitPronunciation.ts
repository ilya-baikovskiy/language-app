import { useCallback, useRef, useState } from 'react';
import { fetchUnitClip } from '../services/generation/lessonsApi';
import type { LanguageCode } from '../../lib/pipeline/languageConfig';
import type { AudioProvider } from '../types/lesson';

// Произношение отдельного слова/фразы/формы в Bottom Sheet — отдельный
// короткий TTS-клип (api/speak-unit.ts), а не нарезка общей дорожки урока.
// Нарезка режет звук на границах соседних слов (коартикуляция) и вообще не
// работает для текста, которого в уроке нет дословно (формы слов, разбор
// фраз по частям). Клип решает оба случая одним механизмом.
//
// Голос клипа обязан совпадать с голосом самого урока (provider приходит от
// вызывающего компонента из lesson.audioProvider) — иначе слово прозвучит
// другим голосом, чем весь урок.

type ClipResult = { audioUrl: string; audioBase64?: string };

function base64ToObjectUrl(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
}

export function useUnitPronunciation(language: LanguageCode, provider: AudioProvider) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Отдельный object URL из audioBase64 (на промахе кэша, см.
  // api/speak-unit.ts) — не браузерный fetch по audioUrl, поэтому его нужно
  // самим отзывать после использования, иначе течёт память на каждый клип.
  const objectUrlRef = useRef<string | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);

  // Клиентский кэш промисов по тексту — shared между prefetch() и speak().
  // Без него прогрев был бесполезен: он грел только серверный кэш (Blob), а
  // speak() всё равно делал СВОЙ отдельный поход на сервер за тем же самым
  // результатом — и этот поход (даже на попадании в Blob) стоит реальное
  // время сам по себе (round-trip до Vercel Blob), не только время TTS.
  // Если promise уже в кэше (готов или ещё выполняется) — speak() просто
  // берёт его, без единого нового запроса.
  const clipCacheRef = useRef<Map<string, Promise<ClipResult>>>(new Map());

  const getOrFetch = useCallback(
    (text: string): Promise<ClipResult> => {
      const cached = clipCacheRef.current.get(text);
      if (cached) return cached;

      const promise = fetchUnitClip(text, language, provider);
      clipCacheRef.current.set(text, promise);
      // На ошибке убираем из кэша — иначе неудачный запрос навсегда "залипнет"
      // отклонённым промисом, и повторные попытки (ретрай, следующий клик)
      // не смогут даже попробовать заново.
      promise.catch(() => clipCacheRef.current.delete(text));
      return promise;
    },
    [language, provider],
  );

  const speak = useCallback(
    (text: string, onError?: (error: Error) => void) => {
      setPendingText(text);
      getOrFetch(text)
        .then(({ audioUrl, audioBase64 }) => {
          setPendingText((prev) => (prev === text ? null : prev));

          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
          }

          // audioBase64 приходит только на промахе кэша (см. speak-unit.ts) —
          // играем сразу из памяти, без ещё одного сетевого похода браузера
          // за тем же файлом по audioUrl.
          const playUrl = audioBase64 ? base64ToObjectUrl(audioBase64) : audioUrl;
          if (audioBase64) objectUrlRef.current = playUrl;

          const audio = new Audio(playUrl);
          audioRef.current = audio;
          return audio.play();
        })
        .catch((err: unknown) => {
          setPendingText((prev) => (prev === text ? null : prev));
          onError?.(err instanceof Error ? err : new Error(String(err)));
        });
    },
    [getOrFetch],
  );

  const isLoading = useCallback((text: string) => pendingText === text, [pendingText]);

  // Тихий прогрев — без autoplay и без pendingText-состояния (кнопку ещё не
  // нажимали, спиннер показывать не нужно). Кладёт промис в общий кэш —
  // именно это и делает прогрев полезным: последующий speak() для того же
  // текста возьмёт готовый (или ещё летящий) промис, а не спросит сервер заново.
  const prefetch = useCallback(
    (text: string) => {
      getOrFetch(text).catch(() => {});
    },
    [getOrFetch],
  );

  return { speak, isLoading, prefetch };
}
