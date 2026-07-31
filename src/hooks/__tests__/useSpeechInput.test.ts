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
let allInstances: RecognitionInstance[] = [];

function captureRecognition(value: RecognitionInstance) {
  instance = value;
  allInstances.push(value);
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
  allInstances = [];
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

  it('транскрипт приводится к нижнему регистру — распознавание капитализирует первое слово, а не форма слова', () => {
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: RecognitionMock,
    });
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechInput());

    act(() => result.current.start('el-GR', onTranscript));
    act(() => {
      instance?.onresult?.({ results: [{ 0: { transcript: 'Διάσημο' }, isFinal: true }] });
    });

    expect(onTranscript).toHaveBeenCalledWith('διάσημο');
  });

  // Регрессия: на практике повторный быстрый тап «Сказать ответ» иногда
  // требовал 2-3 попытки, прежде чем слово подставлялось. Причина — callbacks
  // отменённой (abort) сессии могут прилететь ПОЗЖЕ, чем стартовала новая
  // (особенно на mobile Safari, где распознавание идёт через сеть): без
  // проверки "это ещё активная сессия?" стейл onend гасил listening для новой
  // записи, и следующий тап путал состояние.
  it('колбэки отменённой (abort) сессии, пришедшие после старта новой, не трогают её состояние', () => {
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: RecognitionMock,
    });
    const firstTranscript = vi.fn();
    const secondTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechInput());

    act(() => result.current.start('el-GR', firstTranscript));
    const firstInstance = allInstances[0];

    // Пользователь сразу жмёт ещё раз — start() сам вызывает abort() старой
    // сессии и создаёт новую.
    act(() => result.current.start('el-GR', secondTranscript));
    const secondInstance = allInstances[1];
    expect(firstInstance.abort).toHaveBeenCalledTimes(1);
    expect(result.current.listening).toBe(true);

    // Стейл-колбэки первой (уже отменённой) сессии долетают ПОСЛЕ того, как
    // вторая уже активна.
    act(() => {
      firstInstance.onresult?.({ results: [{ 0: { transcript: 'старое' }, isFinal: true }] });
      firstInstance.onend?.();
    });

    expect(firstTranscript).not.toHaveBeenCalled();
    // Стейл onend не должен был погасить listening текущей (второй) сессии.
    expect(result.current.listening).toBe(true);

    // А реальный результат второй сессии по-прежнему подхватывается.
    act(() => {
      secondInstance.onresult?.({ results: [{ 0: { transcript: 'νέο' }, isFinal: true }] });
      secondInstance.onend?.();
    });
    expect(secondTranscript).toHaveBeenCalledWith('νέο');
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
