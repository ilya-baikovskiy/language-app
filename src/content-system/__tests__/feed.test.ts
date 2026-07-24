import { describe, expect, it } from 'vitest';
import { composeFixedFeed } from '../feed';
import { FEED_SLOTS, type ContentCard } from '../types';

function makeCard(id: string): ContentCard {
  const now = '2026-07-23T00:00:00.000Z';
  return {
    id,
    schemaVersion: 1,
    canonicalSubjectKey: `subject-${id}`,
    editorialTitleRu: `Заголовок ${id}`,
    editorialDescriptionRu: `Описание ${id}`,
    emoji: '📘',
    topicIds: ['everyday_life'],
    format: 'calm_story',
    countryOrRegionIds: ['greece'],
    estimatedReadingSeconds: 120,
    provenanceType: 'ai_fiction',
    learningNodeIds: [],
    generationStatus: 'idea_only',
    featuredEligibility: false,
    quality: {},
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

describe('composeFixedFeed', () => {
  it('returns exactly 5 positions when the pool is large enough', () => {
    const cards = Array.from({ length: 8 }, (_, i) => makeCard(`card-${i}`));
    const result = composeFixedFeed(cards, []);
    expect(result).toHaveLength(5);
    expect(result.map((item) => item.position)).toEqual([0, 1, 2, 3, 4]);
  });

  it('assigns each of the 5 fixed slots exactly once (no duplicate slot)', () => {
    const cards = Array.from({ length: 8 }, (_, i) => makeCard(`card-${i}`));
    const result = composeFixedFeed(cards, []);
    const slots = result.map((item) => item.slot);
    expect(new Set(slots).size).toBe(slots.length);
    expect(slots).toEqual([...FEED_SLOTS]);
  });

  it('avoids previously shown cards when enough unseen cards remain', () => {
    const cards = Array.from({ length: 8 }, (_, i) => makeCard(`card-${i}`));
    const previouslyShown = ['card-0', 'card-1', 'card-2'];
    const result = composeFixedFeed(cards, previouslyShown);
    expect(result.map((item) => item.cardId)).not.toContain('card-0');
    expect(result.map((item) => item.cardId)).not.toContain('card-1');
    expect(result.map((item) => item.cardId)).not.toContain('card-2');
  });

  it('allows repeats when there are not enough unseen cards to avoid an empty/short feed', () => {
    const cards = Array.from({ length: 6 }, (_, i) => makeCard(`card-${i}`));
    // Все, кроме одной, уже показаны — уникальных карточек не хватит на 5 слотов.
    const previouslyShown = ['card-0', 'card-1', 'card-2', 'card-3', 'card-4'];
    const result = composeFixedFeed(cards, previouslyShown);
    expect(result).toHaveLength(5);
    // Единственная непоказанная карточка обязана попасть в ленту.
    expect(result.map((item) => item.cardId)).toContain('card-5');
  });

  it('returns fewer than 5 items when the eligible pool itself is smaller', () => {
    const cards = [makeCard('only-one')];
    const result = composeFixedFeed(cards, []);
    expect(result).toHaveLength(1);
    expect(result[0].slot).toBe(FEED_SLOTS[0]);
  });

  it('returns an empty feed for an empty pool instead of throwing', () => {
    expect(composeFixedFeed([], [])).toEqual([]);
  });
});
