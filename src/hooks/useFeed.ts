// Лента «Выбрать» — см. docs/content-system-v1.2/16_APPROVED_MOBILE_UX_AND_NAVIGATION.md
// §5 и 02_CONTENT_CATALOG_AND_CARD_SYSTEM.md §7-8.
//
// Полностью клиентский: ContentCardRepository по умолчанию — CompositeCardRepository,
// склеивающий StaticSeedCardRepository (versioned JSON, в бандле) и
// BlobGeneratedCardRepository (AI-пул, Pipeline A, см. 07 §2) за одним интерфейсом.
// Ranking внутри — composeFixedFeed (детерминированный fixed slot composer, НЕ
// recommendation алгоритм из 04 — тот выключен флагом adaptiveRankingEnabled).
//
// previouslyShownCardIds хранится в памяти хука на сессию (не persisted) —
// сознательный минимализм PR 2: цель anti-repeat правила — не показывать те
// же 5 карточек повторно при нажатии «Предложить другие» внутри одной
// сессии, не построение долгоживущей истории показов (это уже область
// tracking/AnalyticsEvent, PR 4).
//
// Pipeline A top-up (см. PROGRESS.md 2026-07-24): если для текущего
// language+level+topics+countries непоказанных карточек в пуле меньше
// LOW_POOL_THRESHOLD, хук в фоне просит сервер сгенерировать ещё ~20 (решённый
// размер прогона) и один раз перезагружает ленту, когда они добавлены. Не
// блокирует текущий рендер и не повторяется для уже опробованного набора
// фильтров в этой сессии (см. attemptedTopUpKeysRef) — сознательно простая
// защита от повторных дорогих AI-вызовов, не полноценный retry/backoff.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { composeFixedFeed } from '../content-system/feed';
import { StaticSeedCardRepository } from '../content-system/repositories/staticSeedCardRepository';
import { BlobGeneratedCardRepository } from '../content-system/repositories/blobGeneratedCardRepository';
import { CompositeCardRepository } from '../content-system/repositories/compositeCardRepository';
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
  generatedCardRepository?: BlobGeneratedCardRepository;
};

const DEFAULT_GENERATED_REPOSITORY = new BlobGeneratedCardRepository();
const DEFAULT_REPOSITORY = new CompositeCardRepository(new StaticSeedCardRepository(), DEFAULT_GENERATED_REPOSITORY);
const LOW_POOL_THRESHOLD = 8;
const TOP_UP_DESIRED_COUNT = 20;

export function useFeed({
  activeLanguage,
  selectedLevel,
  enabledTopicIds,
  enabledCountryOrRegionIds,
  cardRepository = DEFAULT_REPOSITORY,
  generatedCardRepository = DEFAULT_GENERATED_REPOSITORY,
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
  // Один прогон top-up на уникальный набор фильтров за сессию — не полноценный
  // retry/backoff, просто защита от повторного дорогого AI-вызова, если
  // пользователь листает настройки туда-сюда или ре-рендерится несколько раз
  // на одном и том же наборе фильтров.
  const attemptedTopUpKeysRef = useRef<Set<string>>(new Set());

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
        // "Сколько ещё непоказанного осталось" считаем ДО этой партии (тот же
        // shownCardIds, что уже используется composeFixedFeed для anti-repeat) —
        // это здоровье пула на будущее, не то, что показано прямо сейчас.
        const unseenCount = cards.filter((card) => !shownCardIds.includes(card.id)).length;

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

        // Pipeline A top-up — см. комментарий у attemptedTopUpKeysRef и хедер
        // файла. Фильтр без тем/стран (пустые массивы) не top-апим — непонятно,
        // для какой комбинации генерировать.
        const topUpKey = `${activeLanguage}|${selectedLevel}|${[...enabledTopicIds].sort().join(',')}|${[...enabledCountryOrRegionIds].sort().join(',')}`;
        if (
          unseenCount < LOW_POOL_THRESHOLD &&
          enabledTopicIds.length > 0 &&
          enabledCountryOrRegionIds.length > 0 &&
          !attemptedTopUpKeysRef.current.has(topUpKey)
        ) {
          attemptedTopUpKeysRef.current.add(topUpKey);
          generatedCardRepository
            .generateAndTopUp({
              language: activeLanguage,
              level: selectedLevel,
              enabledTopicIds,
              enabledCountryOrRegionIds,
              desiredCount: TOP_UP_DESIRED_COUNT,
            })
            .then((added) => {
              if (cancelled || added.length === 0) return;
              // Переиспользуем reloadNonce/'refresh' — нет отдельного
              // FeedSourceKind под "пул тихо пополнился на фоне" (это не то
              // же самое, что пользователь нажал «Предложить другие», но
              // достаточно близко по смыслу: контент ленты обновился не по
              // смене языка/уровня/фильтров). Отдельный source можно завести
              // отдельно, если аналитика реально начнёт путать эти два случая.
              setReloadNonce((n) => n + 1);
            })
            .catch((err) => {
              // Пул остаётся на seed-наборе — top-up это дополнение, не
              // критическая зависимость ленты (тот же принцип, что у
              // CompositeCardRepository.listCandidates).
              console.error('Pipeline A top-up failed:', err);
            });
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
