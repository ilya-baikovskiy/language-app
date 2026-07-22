// Единственная точка, где пайплайн знает про конкретный язык. Добавление
// нового языка — это новая запись в реестре (+ подбор голоса на слух), а не
// редизайн вызывающего кода (tokenize.ts, generateAudio.ts, elevenLabsAudio.ts,
// api/*.ts читают язык из тела запроса/урока, не хардкодят 'fr').

export type LanguageCode = 'fr' | 'de' | 'en' | 'el';

export type VoiceConfig = {
  /** Голос TTS (gpt-4o-mini-tts). */
  openaiVoice: string;
  /** Голос ElevenLabs (premade voice_id), перекрывается env ELEVENLABS_VOICE_ID. */
  elevenLabsVoiceId: string;
  /** Модель ElevenLabs TTS — multilingual нужна, чтобы голос говорил не по-английски. */
  elevenLabsModelId: string;
  /**
   * Базовый темп речи ElevenLabs (voice_settings.speed, диапазон 0.7–1.2).
   * Это не пост-обработка time-stretch (как отклонённый числовой speed у
   * OpenAI — звучал как "ускоренная плёнка"), а параметр самого синтеза.
   * Нужен, потому что при 1.0 голос для учащихся звучит слишком быстро.
   * Регулятор скорости в UI (0.6–1.5×) работает поверх этого при проигрывании.
   */
  elevenLabsSpeed: number;
};

export type LanguageConfig = {
  code: LanguageCode;
  /** Имя для UI (селектор языка на экране создания урока). */
  displayName: string;
  /** Как называть язык в промптах (на английском — модели стабильнее следуют инструкциям). */
  promptLanguageName: string;
  /** BCP-47 тег для Intl.Segmenter (языкозависимая разбивка на предложения). */
  bcp47: string;
  /** ISO 639-1 код для параметра language в Whisper. */
  whisperLanguageCode: string;
  voices: VoiceConfig;
  /** Голос подобран и проверен на слух носителем/продвинутым учеником. */
  voiceVerified: boolean;
};

// eleven_multilingual_v2 умеет говорить на fr/de/en/el одним и тем же premade
// voice_id — поэтому для непроверенных языков переиспользуем голос fr как
// временный дефолт, а не оставляем язык вовсе без конфигурации.
const FALLBACK_ELEVENLABS_VOICE_ID = 'XrExE9yKIg1WjnnlVkGX'; // Matilda
const FALLBACK_ELEVENLABS_MODEL_ID = 'eleven_multilingual_v2';

export const LANGUAGE_CONFIGS: Record<LanguageCode, LanguageConfig> = {
  fr: {
    code: 'fr',
    displayName: 'Французский',
    promptLanguageName: 'French',
    bcp47: 'fr-FR',
    whisperLanguageCode: 'fr',
    voiceVerified: true,
    voices: {
      openaiVoice: 'marin',
      // Matilda — выбрана на слух из трёх кандидатов в audio-samples/
      // (см. scripts/generate-audio-sample.mjs).
      elevenLabsVoiceId: FALLBACK_ELEVENLABS_VOICE_ID,
      elevenLabsModelId: FALLBACK_ELEVENLABS_MODEL_ID,
      elevenLabsSpeed: 0.8,
    },
  },
  de: {
    code: 'de',
    displayName: 'Немецкий',
    promptLanguageName: 'German',
    bcp47: 'de-DE',
    whisperLanguageCode: 'de',
    voiceVerified: false,
    voices: {
      openaiVoice: 'marin',
      elevenLabsVoiceId: FALLBACK_ELEVENLABS_VOICE_ID,
      elevenLabsModelId: FALLBACK_ELEVENLABS_MODEL_ID,
      elevenLabsSpeed: 0.8,
    },
  },
  en: {
    code: 'en',
    displayName: 'Английский',
    promptLanguageName: 'English',
    bcp47: 'en-US',
    whisperLanguageCode: 'en',
    voiceVerified: false,
    voices: {
      openaiVoice: 'marin',
      elevenLabsVoiceId: FALLBACK_ELEVENLABS_VOICE_ID,
      elevenLabsModelId: FALLBACK_ELEVENLABS_MODEL_ID,
      elevenLabsSpeed: 0.9,
    },
  },
  el: {
    code: 'el',
    displayName: 'Греческий',
    promptLanguageName: 'Greek',
    bcp47: 'el-GR',
    whisperLanguageCode: 'el',
    voiceVerified: false,
    voices: {
      openaiVoice: 'marin',
      elevenLabsVoiceId: FALLBACK_ELEVENLABS_VOICE_ID,
      elevenLabsModelId: FALLBACK_ELEVENLABS_MODEL_ID,
      elevenLabsSpeed: 0.8,
    },
  },
};

export function getLanguageConfig(code: LanguageCode): LanguageConfig {
  const config = LANGUAGE_CONFIGS[code];
  if (!config) throw new Error(`Нет LanguageConfig для языка "${code}"`);
  return config;
}

export function listLanguageConfigs(): LanguageConfig[] {
  return Object.values(LANGUAGE_CONFIGS);
}
