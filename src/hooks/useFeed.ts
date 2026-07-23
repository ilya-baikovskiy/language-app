// Лента «Выбрать» — см. docs/content-system-v1.2/16_APPROVED_MOBILE_UX_AND_NAVIGATION.md
// §5 и 02_CONTENT_CATALOG_AND_CARD_SYSTEM.md §7-8.
//
// Полностью клиентский: ContentCardRepository (по умолчанию
// StaticSeedCardRepository) уже сейчас читает versioned JSON, подключённый в
// бандл (см. staticSeedCardRepository.ts) — отдельный /api/feed эндпоинт не
// нужен для PR 2 (seed-first, см. брифа §«Seed-first»). Ranking внутри —
// composeFixedFeed (детерминированный fixed slot composer, НЕ recommendation
// алгоритм из 04 — тот выключен флагом adaptiveRankingEnabled).
//
// previouslyShownCardIds хранится в памяти хука на сессию (не persisted) —
// сознательный минимализм PR 2: цель anti-repeat правила — не показывать те
// же 5 карточек повторно при нажатии «Предложить другие» внутри одной
// сессии, не построение долгоживущей истории показов (это уже область
// tracking/AnalyticsEvent, PR 4).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { composeFixedFeed } from '../content-system/feed';
import { StaticSeedCardRepository } from '../content-system/repositories/staticSeedCardRepository';
import { track } from '../content-system/analytics/eventClient';
import type { ContentCardRepository } from '../content-system/repositories';
import type { CEFRLevel, ContentCard, FeedSlot } from '../content-system/types';
import type { FeedSourceKind } from '../content-system/analyticsEvent';
import type { LanguageCode } from '../../lib/pipeline/languageConfig';

export type FeedDisplayItem = {
  position: number;
  slot: FeedSlot;
  card: ContentCard;
};

export type UseFeedParams = {
  activeLanguage: LanguageCode;
  selectedLevel: CEFRLevel;
  enabledTopicIds: string[];
  enabledCountryOrRegionIds: string[];
  cardRepository?: ContentCardRepository;
};

const DEFAULT_REPOSITORY = new StaticSeedCardRepository();

export function useFeed({
  activeLanguage,
  selectedLevel,
  enabledTopicIds,
  enabledCountryOrRegionIds,
  cardRepository = DEFAULT_REPOSITORY,
}: UseFeedParams) {
  const [items, setItems] = useState<FeedDisplayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shownCardIds, setShownCardIds] = useState<string[]>([]);
  // Каждый вызов load() увеличивает nonce — используется как ручной триггер
  // «Предложить другие» без дублирования логики загрузки.
  const [reloadNonce, setReloadNonce] = useState(0);
  const [feedBatchId, setFeedBatchId] = useState<string | null>(null);
  const [feedViewedAt, setFeedViewedAt] = useState<number | null>(null);

  const query = useMemo(
    () => ({
      language: activeLanguage,
      level: selectedLevel,
      topicIds: enabledTopicIds,
      countryOrRegionIds: enabledCountryOrRegionIds,
    }),
    [activeLanguage, selectedLevel, enabledTopicIds, enabledCountryOrRegionIds],
  );

  // Tracking's `feed_viewed.source` (05 §6) must reflect *why* this particular
  // load ran, not be guessed after the fact from what happens to have changed
  // in `query` — so we compare against refs captured on the previous run
  // rather than reasoning from `query` itself.
  const isFirstLoadRef = useRef(true);
  const prevReloadNonceRef = useRef(reloadNonce);
  const prevLangLevelKeyRef = useRef(`${activeLanguage}|${selectedLevel}`);
  const feedBatchIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    let source: FeedSourceKind;
    if (reloadNonce !== prevReloadNonceRef.current) {
      source = 'refresh';
    } else if (isFirstLoadRef.current) {
      source = 'app_open';
    } else if (`${activeLanguage}|${selectedLevel}` !== prevLangLevelKeyRef.current) {
      source = 'language_switch';
    } else {
      source = 'settings_change';
    }
    const previousBatchId = feedBatchIdRef.current;

    cardRepository
      .listCandidates(query)
      .then((cards) => {
        if (cancelled) return;
        const assignments = composeFixedFeed(cards, shownCardIds);
        const cardsById = new Map(cards.map((card) => [card.id, card]));
        const nextItems = assignments
          .map((assignment) => {
            const card = cardsById.get(assignment.cardId);
            return card ? { position: assignment.position, slot: assignment.slot, card } : null;
          })
          .filter((item): item is FeedDisplayItem => item !== null);
        setItems(nextItems);
        setShownCardIds((prev) => Array.from(new Set([...prev, ...nextItems.map((item) => item.card.id)])));

        // Client-side batch id for tracking correlation only (card_impression/
        // card_opened/feed_refreshed) — NOT a persisted FeedBatch (06 §5.4),
        // see brief §PR 4 "НЕ полноценный persisted FeedBatch, это отдельная
        // будущая работа".
        const newBatchId = crypto.randomUUID();
        feedBatchIdRef.current = newBatchId;
        setFeedBatchId(newBatchId);
        const viewedAt = Date.now();
        setFeedViewedAt(viewedAt);

        track('feed_viewed', { itemCount: nextItems.length, selectedLevel, source });
        if (source === 'refresh') {
          track('feed_refreshed', { previousBatchId: previousBatchId ?? '' });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Не удалось загрузить ленту материалов:', err);
        setError(err instanceof Error ? err.message : 'Не удалось загрузить ленту материалов');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    isFirstLoadRef.current = false;
    prevReloadNonceRef.current = reloadNonce;
    prevLangLevelKeyRef.current = `${activeLanguage}|${selectedLevel}`;

    return () => {
      cancelled = true;
    };
    // shownCardIds намеренно не в deps: обновляется этим же эффектом, добавление
    // его сюда зациклило бы загрузку при каждом успешном ответе. reloadNonce —
    // единственный способ форсировать перезапуск без смены query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, cardRepository, reloadNonce, activeLanguage, selectedLevel]);

  const refresh = useCallback(() => setReloadNonce((n) => n + 1), []);

  return { items, loading, error, refresh, feedBatchId, feedViewedAt };
}
