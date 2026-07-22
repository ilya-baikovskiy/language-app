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
  annotationId?: string;
  startTime?: number;
  endTime?: number;
};

export type Annotation = {
  id: string;
  type: 'word' | 'phrase';
  tokenIds: string[];
  displayText: string;
  lemma: string;
  pronunciation?: string;
  partOfSpeech?: string;
  grammarLabel?: string;
  shortTranslation: string;
  contextualMeaning: string;
  constructionExplanation?: string;
  grammarSummary?: string;
  grammarDetails?: string;
  otherMeanings?: Meaning[];
  examples?: Example[];
  // --- Тир 1 (базовое, приходит по клику) ---
  // Базовая форма/фраза/модель + перевод («arriver → прибывать»): каждая
  // иностранная единица сразу с переводом, грамматика конкретна, без жаргона.
  baseForm?: FormPair;
  // Форма как в тексте + перевод в этом контексте («arrivait → приближалась»).
  formInText?: FormPair;
  // Только для фраз: собранная фраза целиком + естественный перевод.
  wholePhrase?: FormPair;
  // Только для фраз/сложных форм: разбор по осмысленным кускам (3–6),
  // не по каждому артиклю/предлогу.
  beginnerBreakdown?: BreakdownPart[];
  // Короткая практическая подсказка («не переводите дословно»), без терминов.
  plainLearningNote?: string;
  // --- Тир 2 (детали, приходят по клику «Подробнее») ---
  // Другие полезные формы (3–5): спряжение по лицам, род/число и т.п.
  formVariants?: FormVariants;
};

export type Meaning = {
  translation: string;
  note?: string;
};

export type Example = {
  targetText: string;
  translation: string;
};

// Иностранный текст + его перевод на язык учащегося. Text остаётся на языке
// текста, meaning — на sourceLanguage.
export type FormPair = {
  text: string;
  meaning: string;
};

export type BreakdownPart = {
  text: string;
  meaning: string;
  note?: string;
};

export type FormVariant = {
  text: string;
  meaning: string;
  note?: string;
  // Форма, совпадающая с той, что в тексте — подсвечивается в списке.
  isCurrent?: boolean;
};

export type FormVariants = {
  title: string;
  items: FormVariant[];
};
