// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSpeechInput } from '../useSpeechInput';

type RecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: {
    results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
  }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
};

let instance: RecognitionInstance | null = null;

function captureRecognition(value: RecognitionInstance) {
  instance = value;
}

class RecognitionMock implements RecognitionInstance {
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: RecognitionInstance['onresult'] = null;
  onerror: RecognitionInstance['onerror'] = null;
  onend: RecognitionInstance['onend'] = null;
  start = vi.fn(() => {
    captureRecognition(this);
  });
  stop = vi.fn();
  abort = vi.fn();
}

afterEach(() => {
  instance = null;
  Reflect.deleteProperty(window, 'webkitSpeechRecognition');
  vi.restoreAllMocks();
});

describe('useSpeechInput', () => {
  it('первый вызов начинает запись, stop завершает её, transcript подставляется без проверки', () => {
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: RecognitionMock,
    });
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechInput());

    act(() => result.current.start('el-GR', onTranscript));
    expect(result.current.listening).toBe(true);
    expect(instance?.lang).toBe('el-GR');
    expect(instance?.start).toHaveBeenCalledTimes(1);

    act(() => result.current.stop());
    expect(instance?.stop).toHaveBeenCalledTimes(1);
    act(() => {
      instance?.onresult?.({
        results: [{ 0: { transcript: ' κατασκευάζονται ' }, isFinal: true }],
      });
      instance?.onend?.();
    });

    expect(onTranscript).toHaveBeenCalledWith('κατασκευάζονται');
    expect(result.current.listening).toBe(false);
  });

  it('завершение по тишине оставляет понятную ошибку рядом с контролом', () => {
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: RecognitionMock,
    });
    const { result } = renderHook(() => useSpeechInput());
    act(() => result.current.start('el-GR', vi.fn()));
    act(() => instance?.onerror?.({ error: 'no-speech' }));
    expect(result.current.error).toBe('Речь не распознана — попробуй ещё раз');
    expect(result.current.listening).toBe(false);
  });
});
