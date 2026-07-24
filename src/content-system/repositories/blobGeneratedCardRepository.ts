// Клиентский adapter поверх api/generated-cards.ts — читает/пишет глобальный
// пул AI-сгенерированных карточек (Pipeline A). saveMany делает
// read-modify-write append на сервере (де-дуп по canonicalSubjectKey).

import { contentCardSchema, type ContentCard } from '../types';
import type { CardCandidateQuery, ContentCardRepository } from '../repositories';
import { matchesCardQuery } from './cardQuery';

export class BlobGeneratedCardRepository implements ContentCardRepository {
  async listCandidates(query: CardCandidateQuery): Promise<ContentCard[]> {
    const res = await fetch('/api/generated-cards');
    if (!res.ok) throw new Error(`/api/generated-cards: ${res.status}`);
    const raw = (await res.json()) as unknown[];
    const cards = raw.map((item) => contentCardSchema.parse(item));
    return cards.filter((card) => matchesCardQuery(card, query));
  }

  async getById(cardId: string): Promise<ContentCard | null> {
    const cards = await this.listCandidates({});
    return cards.find((card) => card.id === cardId) ?? null;
  }

  async saveMany(cards: ContentCard[]): Promise<void> {
    if (cards.length === 0) return;
    const res = await fetch('/api/generated-cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cards }),
    });
    if (!res.ok) throw new Error(`/api/generated-cards: ${res.status}`);
  }
}
