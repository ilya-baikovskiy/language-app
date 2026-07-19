import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lesson } from '../types/lesson';
import type { PlaybackStatus } from '../types/reader';
import { BrowserSpeechAdapter } from '../services/narration/BrowserSpeechAdapter';
import type { NarrationAdapter } from '../services/narration/NarrationAdapter';
import { firstWordTokenId } from '../lib/lessonText';

export const NARRATION_RATE_STEPS = [0.6, 0.8, 1, 1.2, 1.5] as const;

export function useNarration(lesson: Lesson) {
  const adapterRef = useRef<NarrationAdapter | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('idle');
  const [activeTokenId, setActiveTokenId] = useState<string | null>(null);
  const [playbackAnchorTokenId, setPlaybackAnchorTokenId] = useState<string | null>(null);
  const [rate, setRateState] = useState<number>(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const adapter = new BrowserSpeechAdapter(lesson);
    adapter.onTokenChange((tokenId) => {
      setActiveTokenId(tokenId);
      setPlaybackAnchorTokenId(tokenId);
    });
    adapter.onComplete(() => setPlaybackStatus('completed'));
    adapter.onError((error) => {
      setErrorMessage(error.message);
      setPlaybackStatus('error');
    });
    adapterRef.current = adapter;
    return () => adapter.stop();
  }, [lesson]);

  const play = useCallback(() => {
    const startTokenId = playbackAnchorTokenId ?? firstWordTokenId(lesson);
    if (!startTokenId) return;
    setErrorMessage(null);
    adapterRef.current?.playFrom(startTokenId, rate);
    setPlaybackAnchorTokenId(startTokenId);
    setPlaybackStatus('playing');
  }, [lesson, playbackAnchorTokenId, rate]);

  const pause = useCallback(() => {
    adapterRef.current?.pause();
    setPlaybackStatus('paused');
  }, []);

  const stop = useCallback(() => {
    adapterRef.current?.stop();
    setPlaybackStatus('stopped');
    setActiveTokenId(null);
    setPlaybackAnchorTokenId(null);
  }, []);

  const setRate = useCallback(
    (nextRate: number) => {
      setRateState(nextRate);
      // Раздел 8.6 ТЗ: смена скорости не возвращает к началу — перезапускаем
      // с текущего произносимого (или последнего) слова новой скоростью.
      if (playbackStatus === 'playing') {
        const anchor = activeTokenId ?? playbackAnchorTokenId;
        if (anchor) adapterRef.current?.playFrom(anchor, nextRate);
      }
    },
    [playbackStatus, activeTokenId, playbackAnchorTokenId],
  );

  const cycleRate = useCallback(() => {
    const currentIndex = NARRATION_RATE_STEPS.indexOf(rate as (typeof NARRATION_RATE_STEPS)[number]);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % NARRATION_RATE_STEPS.length;
    setRate(NARRATION_RATE_STEPS[nextIndex]);
  }, [rate, setRate]);

  // Раздел 7.4/8.5 ТЗ: клик по слову ставит чтение на паузу (если оно шло) и
  // сдвигает точку старта на выбранное слово — реальный Play продолжит отсюда.
  const inspectToken = useCallback((tokenId: string) => {
    setPlaybackStatus((prev) => {
      if (prev === 'playing') {
        adapterRef.current?.pause();
        return 'paused';
      }
      return prev;
    });
    setPlaybackAnchorTokenId(tokenId);
  }, []);

  const continueFrom = useCallback(
    (tokenId: string) => {
      setErrorMessage(null);
      adapterRef.current?.playFrom(tokenId, rate);
      setActiveTokenId(tokenId);
      setPlaybackAnchorTokenId(tokenId);
      setPlaybackStatus('playing');
    },
    [rate],
  );

  const replay = useCallback(() => {
    const startTokenId = firstWordTokenId(lesson);
    if (!startTokenId) return;
    setErrorMessage(null);
    adapterRef.current?.playFrom(startTokenId, rate);
    setActiveTokenId(startTokenId);
    setPlaybackAnchorTokenId(startTokenId);
    setPlaybackStatus('playing');
  }, [lesson, rate]);

  const speakSelection = useCallback((text: string) => adapterRef.current?.speakSelection(text, rate), [rate]);

  return {
    playbackStatus,
    activeTokenId,
    playbackAnchorTokenId,
    rate,
    errorMessage,
    play,
    pause,
    stop,
    setRate,
    cycleRate,
    inspectToken,
    continueFrom,
    replay,
    speakSelection,
  };
}
