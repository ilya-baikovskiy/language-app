// Contracts for Content System v1.2 (см. docs/content-system-v1.2/02, /06, /07).
// Zod — по прямой рекомендации 11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md
// («используй существующую schema library, если её нет — предпочти Zod»):
// в проекте до этого не было runtime-валидации схем, только TS-типы.
//
// Это PR 1 (storage-independent foundation) — только контракты и repository
// interfaces, без UI, без ranking, без базы данных. Не менять без сверки с
// docs/content-system-v1.2/12_DECISIONS_AND_OPEN_QUESTIONS.md.

import { z } from 'zod';

// LanguageCode уже существует как единственная точка правды о поддерживаемых
// языках пайплайна — переиспользуем, а не дублируем список 'fr'|'de'|'en'|'el'.
import type { LanguageCode } from '../../lib/pipeline/languageConfig';

export const CEFR_LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CEFRLevel = (typeof CEFR_LEVELS)[number];
export const cefrLevelSchema = z.enum(CEFR_LEVELS);

export const CONTENT_FORMATS = [
  'calm_story',
  'story_with_dialogue',
  'practical_dialogue',
  'cultural_miniature',
  'fact_explainer',
  'historical_episode',
  'place_portrait',
  'adapted_article',
  'current_event',
  'language_note',
  'serialized_story_episode',
  'user_text_adaptation',
] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];
export const contentFormatSchema = z.enum(CONTENT_FORMATS);

export const PROVENANCE_TYPES = [
  'ai_fiction',
  'source_based_explainer',
  'adapted_article',
  'current_event',
  'user_text',
] as const;
export type ProvenanceType = (typeof PROVENANCE_TYPES)[number];
export const provenanceTypeSchema = z.enum(PROVENANCE_TYPES);

export const FEED_SLOTS = [
  'hero_interest',
  'learning_gap',
  'mandatory_foundation',
  'diversity',
  'stretch_or_fresh',
] as const;
export type FeedSlot = (typeof FEED_SLOTS)[number];
export const feedSlotSchema = z.enum(FEED_SLOTS);

// Известные коды из 04_RECOMMENDATION_ALGORITHM.md §9. Список открыт (не enum
// в рантайме) — ranking-слой (Phase 7+) будет добавлять новые коды, и это не
// должно ломать уже сохранённые FeedItem/RecommendationExplanation.
export const KNOWN_RECOMMENDATION_REASON_CODES = [
  'LIKED_SIMILAR_CULTURE',
  'UNDEREXPOSED_HOUSING',
  'LEVEL_FIT_HIGH',
  'NEW_FORMAT',
  'TRIAL_NEXT_LEVEL',
  'FRESH_SOURCE',
  'RECENT_REPEAT_PENALTY',
  'MANDATORY_FOUNDATION',
] as const;
export type RecommendationReasonCode = string;
export const recommendationReasonCodeSchema = z.string().min(1);

// см. docs/content-system-v1.2/14_SOURCE_REGISTRY_AND_EDITORIAL_POLICY.md §5.
export const sourceReferenceSchema = z.object({
  id: z.string(),
  registrySourceId: z.string().optional(),
  title: z.string(),
  url: z.string(),
  publishedAt: z.string().optional(),
  retrievedAt: z.string().optional(),
  quote: z.string().optional(),
});
export type SourceReference = z.infer<typeof sourceReferenceSchema>;

// --- ContentCard: canonical, cross-language idea (см. 02 §5) ---------------

const levelSuitabilitySchema = z.object({ min: cefrLevelSchema, max: cefrLevelSchema });

export const contentCardSchema = z.object({
  id: z.string(),
  schemaVersion: z.number().int().positive(),
  canonicalSubjectKey: z.string(),

  editorialTitleRu: z.string(),
  editorialDescriptionRu: z.string(),
  // 1-2 эмодзи (тема + страна), встраивается в начало заголовка на карточке —
  // см. ContentCardTile.tsx. Не картинка/градиент, не генерируется AI:
  // подбирается вручную при написании темы (как editorialTitleRu).
  emoji: z.string(),
  learningFocusLabelRu: z.string().optional(),

  topicIds: z.array(z.string()),
  format: contentFormatSchema,
  countryOrRegionIds: z.array(z.string()),

  estimatedReadingSeconds: z.number().int().positive(),
  provenanceType: provenanceTypeSchema,

  supportedLanguages: z.array(z.string()).optional(),
  levelSuitability: z.record(z.string(), levelSuitabilitySchema).optional(),

  learningNodeIds: z.array(z.string()),
  sourceRefs: z.array(sourceReferenceSchema).optional(),
  freshness: z
    .object({
      sourcePublishedAt: z.string().optional(),
      cardPreparedAt: z.string(),
      expiresAt: z.string().optional(),
    })
    .optional(),

  generationStatus: z.enum(['idea_only', 'blueprint_ready']),
  featuredEligibility: z.boolean(),

  quality: z.object({
    factualConfidence: z.number().min(0).max(1).optional(),
    editorialScore: z.number().min(0).max(1).optional(),
    predictedInterestScore: z.number().min(0).max(1).optional(),
  }),

  status: z.enum(['active', 'archived', 'expired']),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ContentCard = z.infer<typeof contentCardSchema>;

// Проекция ContentCard, которую можно отдавать в feed response (07/11 §MVP
// feed response: «не отдавай production UI внутренние scores без необходимости»).
// В PR 1 не используется (нет ещё FeedPage), но фиксируем форму заранее, чтобы
// PR 2 не придумывал её на ходу.
export type PublicContentCard = Pick<
  ContentCard,
  | 'id'
  | 'editorialTitleRu'
  | 'editorialDescriptionRu'
  | 'estimatedReadingSeconds'
  | 'provenanceType'
>;

// --- FeedItem / FeedBatch (см. 02 §6, 06 §5.4) ------------------------------

export const feedItemSchema = z.object({
  cardId: z.string(),
  language: z.string(),
  targetLevel: cefrLevelSchema,
  position: z.number().int().nonnegative(),
  slot: feedSlotSchema,
  reasonCodes: z.array(recommendationReasonCodeSchema),
});
export type FeedItem = z.infer<typeof feedItemSchema> & { language: LanguageCode };

export type FeedContextSnapshot = {
  activeLanguage: LanguageCode;
  selectedLevel: CEFRLevel;
  enabledTopicIds: string[];
  enabledCountryOrRegionIds: string[];
};

export type FeedBatch = {
  id: string;
  userId: string;
  language: LanguageCode;
  selectedLevel: CEFRLevel;
  algorithmVersion: string;
  createdAt: string;
  contextSnapshot: FeedContextSnapshot;
  items: FeedItem[];
};

// --- LessonBlueprint (см. 06 §5.5, 07 §3) — минимальный контракт для PR 1 --
// Полная сборка Blueprint из card+profile — работа PR 3 (card → Lesson).
// Здесь фиксируем только форму данных, чтобы repository interface и Lesson
// pipeline adapter могли на неё ссылаться уже сейчас.

export type LessonLearningPassport = {
  primaryNodeIds: string[];
  secondaryNodeIds: string[];
  plannedNewNodeIds: string[];
  plannedReinforcementNodeIds: string[];
  expectedDifficulty: number;
  targetKnownLexicalRatio?: number;
  maxSentenceLength?: number;
  maxNewGrammarStructures?: number;
  discourseType: string;
  communicativeGoal?: string;
};

export type LessonBlueprintData = {
  cardId: string;
  canonicalSubjectKey: string;
  language: LanguageCode;
  targetLevel: CEFRLevel;
  editorialTitleRu: string;
  targetLanguageTitle: string;
  format: ContentFormat;
  provenanceType: ProvenanceType;
  contentGoal: string;
  outline: string[];
  sourceRefs?: SourceReference[];
  sourceFacts?: Array<{ claim: string; sourceRefId: string }>;
  learningPassport: LessonLearningPassport;
  styleConstraints: {
    tone: 'calm' | 'neutral' | 'curious' | 'practical';
    targetWords: number;
    minWords: number;
    maxWords: number;
    dialogueRatio?: number;
    avoidSchoolLikeTone: boolean;
    adultAudience: boolean;
  };
  languageConstraints: {
    allowedGrammarNodeCodes: string[];
    preferredGrammarNodeCodes: string[];
    avoidGrammarNodeCodes: string[];
    targetConstructions?: string[];
  };
};

export type StoredLessonBlueprint = {
  id: string;
  cardId?: string;
  userId: string;
  language: LanguageCode;
  targetLevel: CEFRLevel;
  promptContractVersion: number;
  data: LessonBlueprintData;
  status: 'draft' | 'validated' | 'used' | 'failed';
  createdAt: string;
  updatedAt: string;
};

// --- Lesson artifact ref / summary — форма, которую отдаёт
// LessonArtifactRepository (см. repositories.ts). Не определены дословно в
// пакете документации (там просто `LessonArtifactRef`/`LessonSummary` без
// полей) — форма ниже минимально совместима с реальным api/lessons.ts +
// api/save-lesson.ts (см. docs/content-system/IMPLEMENTATION_DISCOVERY.md).

export type LessonArtifactRef = {
  lessonId: string;
  lessonUrl: string;
  audioUrl: string;
};

// Библиотечный статус урока (16 §9). `started`/`completed` объявлены здесь
// для полноты enum'а из документа, но в этом PR не проставляются нигде
// (нет ещё lastOpenedAt/reading progress tracking — отдельная будущая
// работа) — реализованы только переходы `creating -> ready`/`creating -> failed`.
export type LessonStatus = 'creating' | 'ready' | 'started' | 'completed' | 'failed';

export type LessonSummary = {
  id: string;
  title: string;
  translatedTitle?: string;
  level: string;
  estimatedMinutes: number;
  languageCode?: string;
  lessonUrl: string;
  audioUrl: string;
  createdAt: string;
  // Отсутствует у записей до PR 3 — repository-слой маппит такие записи в
  // 'ready' (см. lessonArtifactRepository.ts), поэтому здесь поле обязательное.
  status: LessonStatus;
  cardId?: string;
  blueprintId?: string;
};
