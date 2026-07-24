// StaticSeedCardRepository — см. docs/content-system-v1.2/06 §3.1 и
// 11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md §«Первая реализация storage».
//
// Читает versioned JSON из git (seeds/content-ideas.v1.json), ничего не
// пишет обратно — seed cards read-only (02 §10: «Seed cards read-only. Они
// не должны изменяться из браузера»). saveMany существует только для
// соответствия ContentCardRepository и явно бросает: если понадобится
// сохранять сгенерированные карточки, это отдельный adapter (Phase 6/7),
// не эта заглушка.

import seedData from '../seeds/content-ideas.v1.json';
import { contentCardSchema, type ContentCard } from '../types';
import type { CardCandidateQuery, ContentCardRepository } from '../repositories';
import { matchesCardQuery } from './cardQuery';

function loadSeedCards(): ContentCard[] {
  return (seedData as unknown[]).map((raw, index) => {
    const result = contentCardSchema.safeParse(raw);
    if (!result.success) {
      throw new Error(`content-ideas.v1.json[${index}] не соответствует ContentCard schema: ${result.error.message}`);
    }
    return result.data;
  });
}

// Модуль загружается один раз на процесс/сессию — seed-набор небольшой
// (единицы-десятки карточек), пересчитывать на каждый вызов незачем.
const SEED_CARDS = loadSeedCards();

export class StaticSeedCardRepository implements ContentCardRepository {
  async listCandidates(query: CardCandidateQuery): Promise<ContentCard[]> {
    return SEED_CARDS.filter((card) => matchesCardQuery(card, query));
  }

  async getById(cardId: string): Promise<ContentCard | null> {
    return SEED_CARDS.find((card) => card.id === cardId) ?? null;
  }

  async saveMany(): Promise<void> {
    throw new Error('StaticSeedCardRepository is read-only — seed cards are edited in git, not saved at runtime.');
  }
}
