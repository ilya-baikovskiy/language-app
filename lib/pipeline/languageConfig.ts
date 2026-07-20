// Единственная точка, где пайплайн знает про конкретный язык. Добавление
// de/en/el позже — это новая запись в реестре + подбор голоса, не редизайн
// вызывающего кода (шагов 2/4/5/6 в scripts/lib/pipeline/*).

export type LanguageCode = 'fr';

export type LanguageConfig = {
  code: LanguageCode;
  /** Как называть язык в промптах (на английском — модели стабильнее следуют инструкциям). */
  promptLanguageName: string;
  /** Голос TTS (gpt-4o-mini-tts). */
  ttsVoice: string;
  /** ISO 639-1 код для параметра language в Whisper. */
  whisperLanguageCode: string;
};

export const LANGUAGE_CONFIGS: Record<LanguageCode, LanguageConfig> = {
  fr: {
    code: 'fr',
    promptLanguageName: 'French',
    ttsVoice: 'marin',
    whisperLanguageCode: 'fr',
  },
};

export function getLanguageConfig(code: LanguageCode): LanguageConfig {
  const config = LANGUAGE_CONFIGS[code];
  if (!config) throw new Error(`Нет LanguageConfig для языка "${code}"`);
  return config;
}
