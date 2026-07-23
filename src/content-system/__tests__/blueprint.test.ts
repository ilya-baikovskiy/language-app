import { describe, expect, it } from 'vitest';
import { buildLessonBlueprint, computeLessonId } from '../blueprint';
import type { CEFRLevel, ContentCard, ContentFormat } from '../types';

function makeCard(overrides: Partial<ContentCard> = {}): ContentCard {
  const now = '2026-07-23T00:00:00.000Z';
  return {
    id: 'seed-test',
    schemaVersion: 1,
    canonicalSubjectKey: 'test-subject',
    editorialTitleRu: 'Тестовая карточка',
    editorialDescriptionRu: 'Короткое описание для теста.',
    learningFocusLabelRu: 'тестовый фокус',
    topicIds: ['everyday_life'],
    format: 'calm_story',
    countryOrRegionIds: ['greece'],
    estimatedReadingSeconds: 90,
    provenanceType: 'ai_fiction',
    learningNodeIds: ['node-1'],
    generationStatus: 'idea_only',
    featuredEligibility: true,
    quality: {},
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('computeLessonId', () => {
  it('is deterministic for the same inputs', () => {
    expect(computeLessonId('seed-001', 'fr', 'A2')).toBe(computeLessonId('seed-001', 'fr', 'A2'));
  });

  it('differs by cardId', () => {
    expect(computeLessonId('seed-001', 'fr', 'A2')).not.toBe(computeLessonId('seed-002', 'fr', 'A2'));
  });

  it('differs by language', () => {
    expect(computeLessonId('seed-001', 'fr', 'A2')).not.toBe(computeLessonId('seed-001', 'de', 'A2'));
  });

  it('differs by level', () => {
    expect(computeLessonId('seed-001', 'fr', 'A2')).not.toBe(computeLessonId('seed-001', 'fr', 'B1'));
  });

  it('matches the documented card-{id}-{lang}-{level} shape', () => {
    expect(computeLessonId('seed-001', 'fr', 'A2')).toBe('card-seed-001-fr-A2');
  });
});

describe('buildLessonBlueprint', () => {
  it('produces a lessonId-derived blueprint id and matching cardId', () => {
    const card = makeCard({ id: 'seed-042' });
    const blueprint = buildLessonBlueprint(card, 'fr', 'A2');
    expect(blueprint.id).toBe(`blueprint-${computeLessonId('seed-042', 'fr', 'A2')}`);
    expect(blueprint.cardId).toBe('seed-042');
    expect(blueprint.language).toBe('fr');
    expect(blueprint.targetLevel).toBe('A2');
    expect(blueprint.status).toBe('draft');
  });

  const wordBands: Record<CEFRLevel, { min: number; max: number }> = {
    A0: { min: 40, max: 90 },
    A1: { min: 70, max: 130 },
    A2: { min: 100, max: 180 },
    B1: { min: 140, max: 230 },
    B2: { min: 180, max: 320 },
    C1: { min: 220, max: 340 },
    C2: { min: 260, max: 380 },
  };

  for (const level of Object.keys(wordBands) as CEFRLevel[]) {
    it(`sets the correct word-count band for ${level}`, () => {
      const card = makeCard();
      const blueprint = buildLessonBlueprint(card, 'fr', level);
      const band = wordBands[level];
      expect(blueprint.data.styleConstraints.minWords).toBe(band.min);
      expect(blueprint.data.styleConstraints.maxWords).toBe(band.max);
      expect(blueprint.data.styleConstraints.targetWords).toBe(Math.round((band.min + band.max) / 2));
    });
  }

  const formatMappings: Array<{
    format: ContentFormat;
    tone: string;
    discourseType: string;
    dialogueRatio?: number;
  }> = [
    { format: 'calm_story', tone: 'calm', discourseType: 'narrative' },
    { format: 'serialized_story_episode', tone: 'calm', discourseType: 'narrative' },
    { format: 'story_with_dialogue', tone: 'practical', discourseType: 'dialogue', dialogueRatio: 0.4 },
    { format: 'practical_dialogue', tone: 'practical', discourseType: 'dialogue', dialogueRatio: 0.4 },
    { format: 'cultural_miniature', tone: 'curious', discourseType: 'description' },
    { format: 'place_portrait', tone: 'curious', discourseType: 'description' },
    { format: 'historical_episode', tone: 'curious', discourseType: 'description' },
    { format: 'fact_explainer', tone: 'neutral', discourseType: 'explanation' },
    { format: 'adapted_article', tone: 'neutral', discourseType: 'explanation' },
    { format: 'current_event', tone: 'neutral', discourseType: 'explanation' },
    { format: 'language_note', tone: 'neutral', discourseType: 'explanation' },
    { format: 'user_text_adaptation', tone: 'neutral', discourseType: 'explanation' },
  ];

  for (const { format, tone, discourseType, dialogueRatio } of formatMappings) {
    it(`maps format "${format}" to tone "${tone}" / discourseType "${discourseType}"`, () => {
      const card = makeCard({ format });
      const blueprint = buildLessonBlueprint(card, 'fr', 'A2');
      expect(blueprint.data.styleConstraints.tone).toBe(tone);
      expect(blueprint.data.learningPassport.discourseType).toBe(discourseType);
      expect(blueprint.data.styleConstraints.dialogueRatio).toBe(dialogueRatio);
    });
  }

  it('carries over card fields (learningNodeIds, sourceRefs, learningFocusLabelRu)', () => {
    const card = makeCard({
      learningNodeIds: ['node-a', 'node-b'],
      learningFocusLabelRu: 'настоящее время',
      sourceRefs: [{ id: 'src-1', title: 'Some source', url: 'https://example.com' }],
    });
    const blueprint = buildLessonBlueprint(card, 'fr', 'B1');
    expect(blueprint.data.learningPassport.primaryNodeIds).toEqual(['node-a', 'node-b']);
    expect(blueprint.data.learningPassport.communicativeGoal).toBe('настоящее время');
    expect(blueprint.data.sourceRefs).toEqual([{ id: 'src-1', title: 'Some source', url: 'https://example.com' }]);
    expect(blueprint.data.outline).toEqual([card.editorialDescriptionRu]);
  });

  it('always avoids school-like tone and targets adult audience', () => {
    const blueprint = buildLessonBlueprint(makeCard(), 'fr', 'A2');
    expect(blueprint.data.styleConstraints.avoidSchoolLikeTone).toBe(true);
    expect(blueprint.data.styleConstraints.adultAudience).toBe(true);
  });
});
