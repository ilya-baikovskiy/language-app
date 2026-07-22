// Связка «TTS + выравнивание». Провайдер выбирается один на оба шага: Forced
// Alignment должен получать ровно ту дорожку, которую сам же и озвучил, а
// Whisper-маппинг настроен под артикуляцию gpt-4o-mini-tts — смешивать нельзя.
export type AudioProvider = 'openai' | 'elevenlabs';

// import type — типовая (не рантайм) циклическая ссылка: AlignmentReport
// сам ссылается на Token/AudioProvider отсюда. TS резолвит такие type-only
// циклы без проблем (verbatimModuleSyntax стирает import type при сборке).
import type { AlignmentReport } from '../../lib/pipeline/alignmentReport.js';

export type Lesson = {
  id: string;
  language: string;
  sourceLanguage: string;
  level: string;
  title: string;
  translatedTitle?: string;
  estimatedMinutes: number;
  coverImage?: string;
  paragraphs: Paragraph[];
  annotations: Annotation[];
  // Чем озвучен урок. Опционально: у уроков, сгенерированных до появления
  // выбора провайдера (и у fixtures), поля нет — это всегда означает 'openai'.
  audioProvider?: AudioProvider;
  // Код языка урока ('fr'|'de'|'en'|'el', см. LanguageConfig) — свободная
  // строка, а не импорт LanguageCode, по тому же принципу, что language/
  // sourceLanguage/level уже строки: тип пайплайна не должен диктовать форму
  // это тип-декларации ридера. Отсутствует у уроков до мультиязычности — тогда 'fr'.
  languageCode?: string;
  // Отчёт о качестве выравнивания на момент генерации — сохраняется вместе с
  // уроком, чтобы можно было постфактум понять, насколько плоха/хороша
  // подсветка, не переслушивая весь урок целиком.
  alignmentReport?: AlignmentReport;
};

export type Paragraph = {
  id: string;
  sentences: Sentence[];
};

export type Sentence = {
  id: string;
  text: string;
  tokens: Token[];
  // Перевод предложения на sourceLanguage. Опционален: в fixtures (sampleLesson)
  // проставлен заранее, для сгенерированных уроков догружается лениво по запросу
  // в режиме перевода (useSentenceTranslations.ts).
  translation?: string;
};

export type Token = {
  id: string;
  text: string;
  normalized: string;
  type: 'word' | 'punctuation';
  sentenceId: string;
  startTime?: number;
  endTime?: number;
};

// Bottom Sheet v2 (см. AI_PIPELINE.md) — каждое слово объясняется независимо,
// Annotation.id === token.id напрямую (составные фразовые id вида
// "gen-t71-t72-t73" ушли вместе с шагом markPhrases — см. историю решения).
// "Связанная фраза" (context.relatedSource/-Translation) — не смена цели
// клика, а подсказка внутри объяснения ОДНОГО выбранного токена.
export type AnnotationSummary = {
  partOfSpeech: string | null;
  // Форма как она стоит в тексте (была formInText).
  displayForm: string;
  // Перевод формы в этом контексте (была shortTranslation).
  translation: string;
  // Что озвучивать по клику на динамик — обычно === displayForm.
  audioText: string;
  context: {
    source: string;
    translation: string;
    selectedSource: string;
    selectedTranslation: string;
    relatedSource?: string | null;
    relatedTranslation?: string | null;
  };
};

export type DetailSection =
  | { type: 'explanation'; title: string | null; body: string }
  | { type: 'table'; title: string | null; columns: string[]; rows: string[][]; highlightRow: number | null }
  | { type: 'bilingualPairs'; title: string | null; pairs: { source: string; translation: string }[] }
  | { type: 'grammarNote'; body: string };

export type Annotation = {
  id: string; // === token.id
  summary: AnnotationSummary;
  // undefined до клика «Подробнее» — тир 2 подгружается лениво.
  details?: { sections: DetailSection[] };
};
