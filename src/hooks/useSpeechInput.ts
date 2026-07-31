import { useCallback, useEffect, useRef, useState } from 'react';

type SpeechResultEvent = {
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
};

type SpeechErrorEvent = { error: string };

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function recognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function useSpeechInput() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = recognitionConstructor() !== null;

  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    },
    [],
  );

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback((bcp47: string, onTranscript: (transcript: string) => void) => {
    const Recognition = recognitionConstructor();
    if (!Recognition) {
      setError('Голосовой ввод не поддерживается этим браузером');
      return;
    }

    recognitionRef.current?.abort();
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = bcp47;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    // abort() выше не гарантирует, что колбэки старой сессии не долетят
    // позже (mobile Safari особенно любит это — там распознавание идёт через
    // сеть, и события старого объекта могут прийти уже после того, как
    // recognitionRef успел указывать на новый). Без этой проверки повторный
    // быстрый тап «Сказать ответ» иногда путал состояние: onend старой сессии
    // гасил listening для новой, и слово не подхватывалось с первого раза —
    // ровно то, что и наблюдалось на практике.
    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition) return;
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      // toLocaleLowerCase — распознавание обычно капитализирует первое слово
      // фразы (это не то же самое, что реальный регистр целевой формы),
      // а сверка ответа и так регистронезависима — просто не вводить
      // пользователя в заблуждение видом ответа.
      if (transcript) onTranscript(transcript.toLocaleLowerCase(bcp47));
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      const message =
        event.error === 'not-allowed'
          ? 'Нет доступа к микрофону'
          : event.error === 'no-speech'
            ? 'Речь не распознана — попробуй ещё раз'
            : 'Не удалось распознать речь';
      setError(message);
      setListening(false);
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      setListening(false);
      recognitionRef.current = null;
    };

    setError(null);
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      setError('Не удалось запустить микрофон');
    }
  }, []);

  return { supported, listening, error, start, stop };
}
