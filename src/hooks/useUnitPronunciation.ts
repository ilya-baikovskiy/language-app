import { useCallback, useRef, useState } from 'react';
import { fetchUnitClip } from '../services/generation/lessonsApi';
import type { LanguageCode } from '../../lib/pipeline/languageConfig';
import type { AudioProvider } from '../types/lesson';

// Произношение отдельного слова/фразы/формы в Bottom Sheet — отдельный
// короткий TTS-клип (api/speak-unit.ts), а не нарезка общей дорожки урока.
// Нарезка режет звук на границах соседних слов (коартикуляция: "découvrir"
// начинало звучать как "couvrir") и вообще не работает для текста, которого
// в уроке нет дословно (формы слов, разбор фраз по частям — они и раньше
// были кнопкой-заглушкой с тостом). Клип решает оба случая одним механизмом.
//
// Голос клипа обязан совпадать с голосом самого урока (provider приходит от
// вызывающего компонента из lesson.audioProvider) — иначе слово прозвучит
// другим голосом, чем весь урок.
export function useUnitPronunciation(language: LanguageCode, provider: AudioProvider) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);

  const speak = useCallback(
    (text: string, onError?: (error: Error) => void) => {
      setPendingText(text);
      fetchUnitClip(text, language, provider)
        .then(({ audioUrl }) => {
          setPendingText((prev) => (prev === text ? null : prev));
          const audio = new Audio(audioUrl);
          audioRef.current = audio;
          return audio.play();
        })
        .catch((err: unknown) => {
          setPendingText((prev) => (prev === text ? null : prev));
          onError?.(err instanceof Error ? err : new Error(String(err)));
        });
    },
    [language, provider],
  );

  const isLoading = useCallback((text: string) => pendingText === text, [pendingText]);

  return { speak, isLoading };
}
