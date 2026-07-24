// Pipeline A, клиентская часть — превращает сырой AI-кандидат
// (GeneratedCardCandidate из lib/pipeline/generateCards.ts) в полноценный
// ContentCard, с той же осторожностью к контролируемым словарям, что и у
// generateAnnotations.ts к LearningNode ids: topicIds/countryOrRegionIds
// от AI не берутся на веру, а фильтруются по каталогу.

import type { GeneratedCardCandidate } from '../../lib/pipeline/generateCards.js';
import { COUNTRIES, TOPICS } from './catalog.js';
import { contentCardSchema, type CEFRLevel, type ContentCard } from './types.js';
import type { LanguageCode } from '../../lib/pipeline/languageConfig.js';

const VALID_TOPIC_IDS = new Set(TOPICS.map((t) => t.id));
const VALID_COUNTRY_IDS = new Set(COUNTRIES.map((c) => c.id));
const VALID_FORMATS = new Set([
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
]);
const VALID_PROVENANCE = new Set(['ai_fiction', 'source_based_explainer', 'adapted_article', 'current_event', 'user_text']);

export type CandidateConversionOptions = {
  language: LanguageCode;
  level: CEFRLevel;
};

// Кандидаты с пустыми topicIds/countryOrRegionIds после фильтрации, невалидным
// format/provenanceType или дублирующимся canonicalSubjectKey отбрасываются
// молча (это генерация "про запас" в общий пул — потерять один плохой
// кандидат из 20 дешевле, чем протащить в ленту мусор).
export function candidatesToContentCards(
  candidates: GeneratedCardCandidate[],
  options: CandidateConversionOptions,
  existingSubjectKeys: Set<string>,
): ContentCard[] {
  const now = new Date().toISOString();
  const seenInBatch = new Set<string>();
  const out: ContentCard[] = [];

  for (const raw of candidates) {
    const subjectKey = raw.canonicalSubjectKey?.trim();
    if (!subjectKey || existingSubjectKeys.has(subjectKey) || seenInBatch.has(subjectKey)) continue;

    const topicIds = (raw.topicIds ?? []).filter((id) => VALID_TOPIC_IDS.has(id));
    const countryOrRegionIds = (raw.countryOrRegionIds ?? []).filter((id) => VALID_COUNTRY_IDS.has(id));
    if (topicIds.length === 0 || countryOrRegionIds.length === 0) continue;
    if (!VALID_FORMATS.has(raw.format) || !VALID_PROVENANCE.has(raw.provenanceType)) continue;
    if (!raw.editorialTitleRu?.trim() || !raw.editorialDescriptionRu?.trim() || !raw.emoji?.trim()) continue;

    const card = {
      id: `gen-${subjectKey}`,
      schemaVersion: 1,
      canonicalSubjectKey: subjectKey,
      editorialTitleRu: raw.editorialTitleRu.trim(),
      editorialDescriptionRu: raw.editorialDescriptionRu.trim(),
      emoji: raw.emoji.trim(),
      learningFocusLabelRu: raw.learningFocusLabelRu?.trim() || undefined,
      topicIds,
      format: raw.format as ContentCard['format'],
      countryOrRegionIds,
      estimatedReadingSeconds: Math.max(30, Math.round(raw.estimatedReadingSeconds) || 90),
      provenanceType: raw.provenanceType as ContentCard['provenanceType'],
      supportedLanguages: [options.language],
      levelSuitability: { [options.language]: { min: options.level, max: options.level } },
      learningNodeIds: [],
      freshness: { cardPreparedAt: now },
      generationStatus: 'idea_only' as const,
      featuredEligibility: false,
      quality: {},
      status: 'active' as const,
      createdAt: now,
      updatedAt: now,
    };

    const result = contentCardSchema.safeParse(card);
    if (!result.success) continue; // защита от неожиданной формы ответа модели
    out.push(result.data);
    seenInBatch.add(subjectKey);
  }

  return out;
}
