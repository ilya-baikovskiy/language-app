// Клиентский adapter поверх api/generated-cards.ts — читает глобальный пул
// AI-сгенерированных карточек (Pipeline A) и умеет пополнить его новой
// AI-генерацией. Один и тот же серверный эндпоинт делает "сгенерировать +
// провалидировать + добавить в пул" атомарно за один вызов (см.
// api/generated-cards.ts) — здесь нет отдельного "просто сохранить готовые
// карточки" пути, поэтому saveMany() из ContentCardRepository для этого
// репозитория не поддерживается напрямую (используй generateAndTopUp).

import { contentCardSchema, type CEFRLevel, type ContentCard } from '../types';
import type { CardCandidateQuery, ContentCardRepository } from '../repositories';
import { matchesCardQuery } from './cardQuery';
import type { LanguageCode } from '../../../lib/pipeline/languageConfig';

export type GenerateAndTopUpRequest = {
  language: LanguageCode;
  level: CEFRLevel;
  enabledTopicIds: string[];
  enabledCountryOrRegionIds: string[];
  desiredCount?: number;
};

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

  async saveMany(): Promise<void> {
    throw new Error(
      'BlobGeneratedCardRepository.saveMany is not supported — use generateAndTopUp, ' +
        'the pool is only ever grown via AI generation (see api/generated-cards.ts).',
    );
  }

  // Триггер Pipeline A: просит сервер сгенерировать пачку кандидатов для
  // текущих тем/стран/языка/уровня и добавить принятые в пул. Возвращает
  // только реально добавленные карточки (см. api/generated-cards.ts).
  async generateAndTopUp(request: GenerateAndTopUpRequest): Promise<ContentCard[]> {
    const res = await fetch('/api/generated-cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw new Error(`/api/generated-cards: ${res.status}`);
    const data = (await res.json()) as { added: unknown[] };
    return data.added.map((item) => contentCardSchema.parse(item));
  }
}
