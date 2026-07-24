// Общий фильтр CardCandidateQuery → boolean, переиспользуется
// StaticSeedCardRepository и BlobGeneratedCardRepository (и их композицией,
// CompositeCardRepository), чтобы seed- и AI-сгенерированные карточки
// фильтровались абсолютно одинаково.

import type { CardCandidateQuery } from '../repositories';
import type { ContentCard } from '../types';

export function matchesCardQuery(card: ContentCard, query: CardCandidateQuery): boolean {
  if (card.status !== 'active') return false;
  if (query.excludeCardIds?.includes(card.id)) return false;
  if (query.language && card.supportedLanguages && !card.supportedLanguages.includes(query.language)) {
    return false;
  }
  if (query.level) {
    const suitability = query.language ? card.levelSuitability?.[query.language] : undefined;
    if (suitability) {
      const levels = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
      const levelIndex = levels.indexOf(query.level);
      if (levelIndex < levels.indexOf(suitability.min) || levelIndex > levels.indexOf(suitability.max)) {
        return false;
      }
    }
  }
  if (query.topicIds?.length && !query.topicIds.some((id) => card.topicIds.includes(id))) return false;
  if (
    query.countryOrRegionIds?.length &&
    !query.countryOrRegionIds.some((id) => card.countryOrRegionIds.includes(id))
  ) {
    return false;
  }
  return true;
}
