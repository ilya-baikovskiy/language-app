// Детерминированный fixed-slot composer — см.
// 11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md §Цель/«MVP feed response» и
// 16_APPROVED_MOBILE_UX_AND_NAVIGATION.md §5 («первая версия показывает пять
// карточек», внутренние роли слотов не видны пользователю).
//
// Это НЕ рекомендательный алгоритм из
// 04_RECOMMENDATION_ALGORITHM.md — тот работает за флагом
// adaptiveRankingEnabled (сейчас всегда false, Phase 7) и явно не входит в
// PR 2. composeFixedFeed ничего не знает про interest score/learning
// gaps/repetition penalties — только раскладывает переданный (уже
// отфильтрованный по языку/уровню/темам/странам) пул карточек по пяти
// фиксированным слотам в детерминированном порядке.
//
// reasonCodes оставлены пустыми массивами намеренно — explainability тоже
// Phase 7 (см. types.ts, RecommendationReasonCode).

import { FEED_SLOTS, type ContentCard, type FeedSlot, type RecommendationReasonCode } from './types';

export type FixedFeedAssignment = {
  cardId: string;
  position: number;
  slot: FeedSlot;
  reasonCodes: RecommendationReasonCode[];
};

const FEED_SIZE = FEED_SLOTS.length;

/**
 * Раскладывает до FEED_SIZE карточек по фиксированным слотам в порядке
 * FEED_SLOTS, начиная позиции с 0.
 *
 * Правило повторов (см. бриф §ChoosePage): карточки из
 * `previouslyShownCardIds` пропускаются, ЕСЛИ без них пул всё ещё покрывает
 * нужное число слотов; если уникальных карточек недостаточно, повтор
 * разрешён — лента не должна быть пустой/короче доступного пула только из-за
 * anti-repeat правила.
 */
export function composeFixedFeed(eligibleCards: ContentCard[], previouslyShownCardIds: string[]): FixedFeedAssignment[] {
  if (eligibleCards.length === 0) return [];

  const notPreviouslyShown = eligibleCards.filter((card) => !previouslyShownCardIds.includes(card.id));

  const chosen: ContentCard[] = notPreviouslyShown.slice(0, FEED_SIZE);

  if (chosen.length < FEED_SIZE && chosen.length < eligibleCards.length) {
    // Уникальных карточек не хватает на полную ленту — добираем повторами
    // из previouslyShownCardIds (в исходном порядке пула), а не оставляем
    // ленту короче доступного количества карточек.
    const chosenIds = new Set(chosen.map((card) => card.id));
    for (const card of eligibleCards) {
      if (chosen.length >= FEED_SIZE) break;
      if (chosenIds.has(card.id)) continue;
      chosen.push(card);
      chosenIds.add(card.id);
    }
  }

  return chosen.slice(0, FEED_SIZE).map((card, index) => ({
    cardId: card.id,
    position: index,
    slot: FEED_SLOTS[index],
    reasonCodes: [],
  }));
}
