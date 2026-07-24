// Склеивает StaticSeedCardRepository (read-only, из git) и
// BlobGeneratedCardRepository (AI-сгенерированный пул, Pipeline A) в один
// ContentCardRepository — useFeed и остальной UI не знают, откуда пришла
// конкретная карточка. saveMany делегируется generated-репозиторию: seed
// остаётся read-only (см. StaticSeedCardRepository.saveMany).

import type { ContentCard } from '../types';
import type { CardCandidateQuery, ContentCardRepository } from '../repositories';

// composeFixedFeed берёт "первые N непоказанных" СТРОГО в порядке массива
// (см. feed.ts) — простая конкатенация [...seed, ...generated] означала, что
// seed-карточки (поддерживающие все языки/уровни) всегда заполняли все 5
// слотов заново на каждой свежей сессии, а AI-сгенерированные не показывались
// вообще, пока пользователь не пролистает «Предложить другие» достаточно раз
// внутри одной сессии, чтобы исчерпать seed. Реальный баг, найден по фидбэку
// "в браузере всё как по-старому" — детерминированная псевдо-перетасовка по
// hash(id) даёт обоим источникам честный шанс попасть в первую пятёрку, не
// меняя порядок при каждом ре-рендере для одного и того же набора карточек.
function stableShuffleKey(cardId: string): number {
  let hash = 0;
  for (let i = 0; i < cardId.length; i += 1) hash = (hash * 31 + cardId.charCodeAt(i)) >>> 0;
  return hash;
}

export class CompositeCardRepository implements ContentCardRepository {
  private readonly seedRepository: ContentCardRepository;
  private readonly generatedRepository: ContentCardRepository;

  constructor(seedRepository: ContentCardRepository, generatedRepository: ContentCardRepository) {
    this.seedRepository = seedRepository;
    this.generatedRepository = generatedRepository;
  }

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
    return Array.from(byId.values()).sort((a, b) => stableShuffleKey(a.id) - stableShuffleKey(b.id));
  }

  async getById(cardId: string): Promise<ContentCard | null> {
    return (await this.seedRepository.getById(cardId)) ?? this.generatedRepository.getById(cardId);
  }

  async saveMany(cards: ContentCard[]): Promise<void> {
    return this.generatedRepository.saveMany(cards);
  }
}
