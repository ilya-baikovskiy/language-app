// @vitest-environment jsdom
//
// Реальный тест хука (не только чтение кода) на вопрос "точно ли работает
// Pipeline A top-up и кнопка «Предложить другие»" — мокаем оба репозитория и
// проверяем фактическое поведение: когда триггерится generateAndTopUp, что
// происходит после его успеха/неудачи, что не триггерится повторно, и что
// refresh() реально запрашивает карточки заново.

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFeed } from '../useFeed';
import { __resetAnalyticsClientForTests } from '../../content-system/analytics/eventClient';
import type { ContentCardRepository } from '../../content-system/repositories';
import type {
  BlobGeneratedCardRepository,
  GenerateAndTopUpRequest,
} from '../../content-system/repositories/blobGeneratedCardRepository';
import type { ContentCard } from '../../content-system/types';

// Без vitest test.globals (проект их не включает — см. vite.config.ts)
// @testing-library/react не регистрирует свой автоматический afterEach(cleanup)
// сам: он ищет globalThis.afterEach. Без явного cleanup() смонтированные в
// предыдущих тестах хуки этого файла остаются висеть в jsdom и продолжают
// рендериться/эффекты срабатывать параллельно со следующим тестом — реально
// приводит к "Maximum update depth exceeded" и зависанию на поздних тестах.
//
// useFeed вызывает track('feed_viewed', ...) на каждой загрузке, который
// заводит фоновый flush-таймер в eventClient.ts — без сброса между тестами
// таймеры (и попытки fetch на /api/events-batch без мока) тоже копятся (см.
// __resetAnalyticsClientForTests, уже используемый в eventClient.test.ts).
afterEach(() => {
  cleanup();
  __resetAnalyticsClientForTests();
});

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

function makeMockRepos(cards: ContentCard[]) {
  const listCandidates = vi.fn(async () => cards);
  const cardRepository: ContentCardRepository = {
    listCandidates,
    getById: vi.fn(async () => null),
    saveMany: vi.fn(async () => {}),
  };
  const generateAndTopUp = vi.fn(async (_request: GenerateAndTopUpRequest): Promise<ContentCard[]> => []);
  const generatedCardRepository = { generateAndTopUp } as unknown as BlobGeneratedCardRepository;
  return { cardRepository, generatedCardRepository, listCandidates, generateAndTopUp };
}

const baseParams = {
  activeLanguage: 'el' as const,
  selectedLevel: 'A2' as const,
  enabledTopicIds: ['everyday_life'],
  enabledCountryOrRegionIds: ['greece'],
};

describe('useFeed — Pipeline A top-up trigger', () => {
  it('запускает generateAndTopUp, когда непоказанных карточек меньше порога', async () => {
    const threeCards = [makeCard('a'), makeCard('b'), makeCard('c')]; // 3 < LOW_POOL_THRESHOLD(8)
    const { cardRepository, generatedCardRepository, generateAndTopUp } = makeMockRepos(threeCards);

    const { result } = renderHook(() => useFeed({ ...baseParams, cardRepository, generatedCardRepository }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(generateAndTopUp).toHaveBeenCalledTimes(1));

    expect(generateAndTopUp).toHaveBeenCalledWith({
      language: 'el',
      level: 'A2',
      enabledTopicIds: ['everyday_life'],
      enabledCountryOrRegionIds: ['greece'],
      desiredCount: 20,
    });
  });

  it('НЕ запускает top-up, когда карточек уже достаточно', async () => {
    const healthyPool = Array.from({ length: 10 }, (_, i) => makeCard(`card-${i}`));
    const { cardRepository, generatedCardRepository, generateAndTopUp } = makeMockRepos(healthyPool);

    const { result } = renderHook(() => useFeed({ ...baseParams, cardRepository, generatedCardRepository }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Даём эффектам отработать полностью — если бы триггер должен был
    // сработать, он бы сделал это к этому моменту.
    await new Promise((r) => setTimeout(r, 20));
    expect(generateAndTopUp).not.toHaveBeenCalled();
  });

  it('с пустыми фильтрами (дефолт "без ограничений") top-up ВСЁ РАВНО запускается по всему каталогу', async () => {
    // Реальный баг: createDefaultAppPreferences даёт [] по умолчанию (значит
    // "весь каталог", см. userTypes.ts) — самый частый случай, пользователь
    // ещё не заходил в настройки. Первая версия триггера требовала непустые
    // списки и поэтому НИКОГДА не срабатывала для дефолтных настроек.
    const threeCards = [makeCard('a'), makeCard('b'), makeCard('c')];
    const { cardRepository, generatedCardRepository, generateAndTopUp } = makeMockRepos(threeCards);

    const { result } = renderHook(() =>
      useFeed({ ...baseParams, enabledTopicIds: [], enabledCountryOrRegionIds: [], cardRepository, generatedCardRepository }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(generateAndTopUp).toHaveBeenCalledTimes(1));

    const call = generateAndTopUp.mock.calls[0][0];
    expect(call.enabledTopicIds.length).toBeGreaterThan(1);
    expect(call.enabledCountryOrRegionIds.length).toBeGreaterThan(1);
  });

  it('после успешного top-up перезагружает ленту и подхватывает новые карточки', async () => {
    const threeCards = [makeCard('a'), makeCard('b'), makeCard('c')];
    const { cardRepository, generatedCardRepository, listCandidates, generateAndTopUp } = makeMockRepos(threeCards);

    const addedCards = [makeCard('gen-1'), makeCard('gen-2')];
    generateAndTopUp.mockResolvedValueOnce(addedCards);
    // Второй вызов listCandidates (после top-up) отдаёт расширенный пул —
    // как реально вело бы себя CompositeCardRepository после пополнения.
    listCandidates.mockResolvedValueOnce(threeCards).mockResolvedValueOnce([...threeCards, ...addedCards]);

    const { result } = renderHook(() => useFeed({ ...baseParams, cardRepository, generatedCardRepository }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(generateAndTopUp).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(listCandidates).toHaveBeenCalledTimes(2));
  });

  it('не повторяет top-up для того же набора фильтров при повторном рендере/refresh', async () => {
    const threeCards = [makeCard('a'), makeCard('b'), makeCard('c')];
    const { cardRepository, generatedCardRepository, generateAndTopUp } = makeMockRepos(threeCards);

    const { result } = renderHook(() => useFeed({ ...baseParams, cardRepository, generatedCardRepository }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(generateAndTopUp).toHaveBeenCalledTimes(1));

    // «Предложить другие» — тот же набор фильтров, top-up уже пробовали.
    await act(async () => {
      result.current.refresh();
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(generateAndTopUp).toHaveBeenCalledTimes(1); // не 2
  });

  it('«Предложить другие» реально запрашивает карточки заново (anti-repeat из composeFixedFeed)', async () => {
    const healthyPool = Array.from({ length: 10 }, (_, i) => makeCard(`card-${i}`));
    const { cardRepository, generatedCardRepository, listCandidates } = makeMockRepos(healthyPool);

    const { result } = renderHook(() => useFeed({ ...baseParams, cardRepository, generatedCardRepository }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listCandidates).toHaveBeenCalledTimes(1);
    const firstBatchIds = result.current.items.map((item) => item.card.id);

    await act(async () => {
      result.current.refresh();
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(listCandidates).toHaveBeenCalledTimes(2);
    // Пул большой (10 карточек, слотов 5) — anti-repeat должен реально
    // подобрать другую пятёрку, а не повторить то же самое.
    const secondBatchIds = result.current.items.map((item) => item.card.id);
    expect(secondBatchIds).not.toEqual(firstBatchIds);
  });
});
