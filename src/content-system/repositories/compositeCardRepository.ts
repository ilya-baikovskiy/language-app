// Склеивает StaticSeedCardRepository (read-only, из git) и
// BlobGeneratedCardRepository (AI-сгенерированный пул, Pipeline A) в один
// ContentCardRepository — useFeed и остальной UI не знают, откуда пришла
// конкретная карточка. saveMany делегируется generated-репозиторию: seed
// остаётся read-only (см. StaticSeedCardRepository.saveMany).

import type { ContentCard } from '../types';
import type { CardCandidateQuery, ContentCardRepository } from '../repositories';

export class CompositeCardRepository implements ContentCardRepository {
  constructor(
    private readonly seedRepository: ContentCardRepository,
    private readonly generatedRepository: ContentCardRepository,
  ) {}

  async listCandidates(query: CardCandidateQuery): Promise<ContentCard[]> {
    const [seedCards, generatedCards] = await Promise.all([
      this.seedRepository.listCandidates(query),
      this.generatedRepository.listCandidates(query).catch((err) => {
        // Пул сгенерированных карточек — это дополнение к seed, не критическая
        // зависимость: если Blob временно недоступен, лента остаётся рабочей
        // на seed-наборе, а не падает целиком.
        console.error('BlobGeneratedCardRepository.listCandidates failed:', err);
        return [] as ContentCard[];
      }),
    ]);
    const byId = new Map<string, ContentCard>();
    for (const card of [...seedCards, ...generatedCards]) byId.set(card.id, card);
    return Array.from(byId.values());
  }

  async getById(cardId: string): Promise<ContentCard | null> {
    return (await this.seedRepository.getById(cardId)) ?? this.generatedRepository.getById(cardId);
  }

  async saveMany(cards: ContentCard[]): Promise<void> {
    return this.generatedRepository.saveMany(cards);
  }
}
