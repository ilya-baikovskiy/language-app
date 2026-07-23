// card -> LessonBlueprint — see 11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md §PR 3
// and 07_AI_CONTENT_GENERATION_PIPELINE.md §3/§4. This is the first place
// that assembles a full LessonBlueprintData from a ContentCard; it does not
// build a real editorial outline (that is Pipeline A / a future content-prep
// step, not this PR) — outline is a single honest placeholder line taken
// straight from the card's own description.

import type { LanguageCode } from '../../lib/pipeline/languageConfig';
import { LOCAL_USER_ID } from './userTypes';
import type { CEFRLevel, ContentCard, ContentFormat, StoredLessonBlueprint } from './types';

export function computeLessonId(cardId: string, language: LanguageCode, targetLevel: CEFRLevel): string {
  return `card-${cardId}-${language}-${targetLevel}`;
}

// 07 §4 word-count bands per CEFR level. C1/C2 are not specified by the
// document (it stops at B2) — the two entries below are this implementation's
// own extrapolation, not sourced from 07, flagged here so it's easy to revisit
// once the document is extended.
const WORD_COUNT_BANDS: Record<CEFRLevel, { min: number; max: number }> = {
  A0: { min: 40, max: 90 },
  A1: { min: 70, max: 130 },
  A2: { min: 100, max: 180 },
  B1: { min: 140, max: 230 },
  B2: { min: 180, max: 320 },
  C1: { min: 220, max: 340 }, // extrapolation, not in 07 §4
  C2: { min: 260, max: 380 }, // extrapolation, not in 07 §4
};

type FormatStyleMapping = {
  tone: 'calm' | 'neutral' | 'curious' | 'practical';
  discourseType: string;
  dialogueRatio?: number;
};

// See brief §PR 3 "Маппинг ContentFormat -> {tone, discourseType, dialogueRatio?}".
const FORMAT_STYLE_MAPPING: Record<ContentFormat, FormatStyleMapping> = {
  calm_story: { tone: 'calm', discourseType: 'narrative' },
  serialized_story_episode: { tone: 'calm', discourseType: 'narrative' },
  story_with_dialogue: { tone: 'practical', discourseType: 'dialogue', dialogueRatio: 0.4 },
  practical_dialogue: { tone: 'practical', discourseType: 'dialogue', dialogueRatio: 0.4 },
  cultural_miniature: { tone: 'curious', discourseType: 'description' },
  place_portrait: { tone: 'curious', discourseType: 'description' },
  historical_episode: { tone: 'curious', discourseType: 'description' },
  fact_explainer: { tone: 'neutral', discourseType: 'explanation' },
  adapted_article: { tone: 'neutral', discourseType: 'explanation' },
  current_event: { tone: 'neutral', discourseType: 'explanation' },
  language_note: { tone: 'neutral', discourseType: 'explanation' },
  user_text_adaptation: { tone: 'neutral', discourseType: 'explanation' },
};

export function buildLessonBlueprint(card: ContentCard, language: LanguageCode, targetLevel: CEFRLevel): StoredLessonBlueprint {
  const lessonId = computeLessonId(card.id, language, targetLevel);
  const band = WORD_COUNT_BANDS[targetLevel];
  const targetWords = Math.round((band.min + band.max) / 2);
  const styleMapping = FORMAT_STYLE_MAPPING[card.format];
  const now = new Date().toISOString();

  const data = {
    cardId: card.id,
    canonicalSubjectKey: card.canonicalSubjectKey,
    language,
    targetLevel,
    editorialTitleRu: card.editorialTitleRu,
    // Real natural target-language title is produced by generateText at the
    // text-generation step, not here — see AI-generated generated.title /
    // translatedTitle in generateLessonPipeline.ts.
    targetLanguageTitle: '',
    format: card.format,
    provenanceType: card.provenanceType,
    contentGoal: `Write a short ${styleMapping.discourseType} piece for an adult language learner, based on this idea: "${card.editorialTitleRu}".`,
    outline: [card.editorialDescriptionRu],
    sourceRefs: card.sourceRefs,
    sourceFacts: undefined,
    learningPassport: {
      primaryNodeIds: card.learningNodeIds,
      secondaryNodeIds: [],
      plannedNewNodeIds: [],
      plannedReinforcementNodeIds: [],
      // Placeholder — there is no difficulty model yet (Phase 6/7 work);
      // 0.5 is a neutral mid-point, not a measurement.
      expectedDifficulty: 0.5,
      discourseType: styleMapping.discourseType,
      communicativeGoal: card.learningFocusLabelRu,
    },
    styleConstraints: {
      tone: styleMapping.tone,
      targetWords,
      minWords: band.min,
      maxWords: band.max,
      dialogueRatio: styleMapping.dialogueRatio,
      avoidSchoolLikeTone: true,
      adultAudience: true,
    },
    languageConstraints: {
      // No grammar node registry yet (Phase 6/13) — all empty.
      allowedGrammarNodeCodes: [],
      preferredGrammarNodeCodes: [],
      avoidGrammarNodeCodes: [],
    },
  };

  return {
    id: `blueprint-${lessonId}`,
    cardId: card.id,
    userId: LOCAL_USER_ID,
    language,
    targetLevel,
    promptContractVersion: 1,
    data,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}
