// Реальный баг, найденный по фидбэку "в браузере всё как по-старому": первая
// версия CompositeCardRepository клала seed-карточки перед
// AI-сгенерированными, а composeFixedFeed берёт "первые N непоказанных"
// строго по порядку массива — значит generated-карточки никогда не попадали
// в первую пятёрку на свежей сессии. Этот тест держит гарантию, что при
// достаточном пуле обоих источников AI-карточки реально оказываются среди
// первых FEED_SIZE кандидатов хотя бы иногда, не только после исчерпания seed.

import { describe, expect, it } from 'vitest';
import { CompositeCardRepository } from '../repositories/compositeCardRepository';
import { composeFixedFeed } from '../feed';
import type { ContentCardRepository } from '../repositories';
import type { ContentCard } from '../types';

function makeCard(id: string): ContentCard {
  const now = '2026-07-24T00:00:00.000Z';
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

function repoOf(cards: ContentCard[]): ContentCardRepository {
  return {
    listCandidates: async () => cards,
    getById: async (id) => cards.find((c) => c.id === id) ?? null,
    saveMany: async () => {},
  };
}

describe('CompositeCardRepository', () => {
  it('склеивает seed и generated без дублей и без падения при ошибке generated', async () => {
    const seed = [makeCard('seed-1'), makeCard('seed-2')];
    const generated = [makeCard('gen-1')];
    const repo = new CompositeCardRepository(repoOf(seed), repoOf(generated));
    const cards = await repo.listCandidates({});
    expect(cards.map((c) => c.id).sort()).toEqual(['gen-1', 'seed-1', 'seed-2']);
  });

  it('падение generated-репозитория не роняет ленту — остаются seed-карточки', async () => {
    const seed = [makeCard('seed-1')];
    const failingGenerated: ContentCardRepository = {
      listCandidates: async () => {
        throw new Error('Blob недоступен');
      },
      getById: async () => null,
      saveMany: async () => {},
    };
    const repo = new CompositeCardRepository(repoOf(seed), failingGenerated);
    const cards = await repo.listCandidates({});
    expect(cards.map((c) => c.id)).toEqual(['seed-1']);
  });

  it('AI-сгенерированные карточки реально попадают в первую пятёрку, а не только seed', async () => {
    const seed = Array.from({ length: 8 }, (_, i) => makeCard(`seed-${i}`));
    const generated = Array.from({ length: 12 }, (_, i) => makeCard(`gen-${i}`));
    const repo = new CompositeCardRepository(repoOf(seed), repoOf(generated));
    const cards = await repo.listCandidates({});

    // Свежая сессия — ничего ещё не показано.
    const firstFive = composeFixedFeed(cards, []).map((a) => a.cardId);
    const generatedInFirstFive = firstFive.filter((id) => id.startsWith('gen-'));

    expect(firstFive).toHaveLength(5);
    // Раньше здесь всегда было 0 — seed заполнял все 5 слотов, потому что
    // конкатенация [...seed, ...generated] ставила seed первым.
    expect(generatedInFirstFive.length).toBeGreaterThan(0);
  });
});
