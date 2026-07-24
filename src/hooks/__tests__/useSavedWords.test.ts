// @vitest-environment jsdom
//
// Реальный тест хука сохранённых слов: мокаем SavedWordRepository (без
// реального Blob/сети) и проверяем фактическое поведение — сохранение,
// снятие сохранения, фильтр по языку (через SavedWord.language напрямую, без
// join через lessonId, как раньше) и одноразовую миграцию из localStorage.

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSavedWords } from '../useSavedWords';
import type { SavedWordRepository } from '../../content-system/repositories';
import type { SavedWord } from '../../content-system/savedWord';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

beforeEach(() => {
  window.localStorage.clear();
});

function makeMockRepo(initial: SavedWord[] = []) {
  let store = [...initial];
  const listByUser = vi.fn(async () => store);
  const upsert = vi.fn(async (word: SavedWord) => {
    store = [word, ...store.filter((w) => w.id !== word.id)];
    return word;
  });
  const remove = vi.fn(async (_userId: string, id: string) => {
    store = store.filter((w) => w.id !== id);
  });
  const repository: SavedWordRepository = { listByUser, upsert, remove };
  return { repository, listByUser, upsert, remove };
}

describe('useSavedWords', () => {
  it('сохраняет слово с полными данными (partOfSpeech/audioText/context), не только текст+перевод', async () => {
    const { repository, upsert } = makeMockRepo();
    const { result } = renderHook(() => useSavedWords(repository));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.toggleSave({
        lessonId: 'lesson-1',
        tokenId: 't1',
        language: 'el',
        level: 'A2',
        surfaceForm: 'μένω',
        partOfSpeech: 'глагол',
        translation: 'жить',
        audioText: 'μένω',
        contextSource: 'Μένω στην Κύπρο.',
        contextTranslation: 'Живу на Кипре.',
      });
    });

    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    const saved = upsert.mock.calls[0][0];
    expect(saved.id).toBe('lesson-1:t1');
    expect(saved.partOfSpeech).toBe('глагол');
    expect(saved.audioText).toBe('μένω');
    expect(saved.contextSource).toBe('Μένω στην Κύπρο.');
    expect(saved.review.repetitions).toBe(0); // стартовый ReviewState, тренировки ещё нет
    expect(result.current.isSaved('lesson-1', 't1')).toBe(true);
  });

  it('повторный тап снимает сохранение (toggle) и реально вызывает remove', async () => {
    const { repository, remove } = makeMockRepo();
    const { result } = renderHook(() => useSavedWords(repository));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const input = {
      lessonId: 'lesson-1',
      tokenId: 't1',
      language: 'el',
      surfaceForm: 'μένω',
      translation: 'жить',
    };
    act(() => result.current.toggleSave(input));
    await waitFor(() => expect(result.current.isSaved('lesson-1', 't1')).toBe(true));

    act(() => result.current.toggleSave(input));
    await waitFor(() => expect(result.current.isSaved('lesson-1', 't1')).toBe(false));
    expect(remove).toHaveBeenCalledWith(expect.any(String), 'lesson-1:t1');
  });

  it('фильтр по языку идёт напрямую через SavedWord.language, без join по lessonId', async () => {
    const now = new Date().toISOString();
    const reviewState = { easeFactor: 2.5, intervalDays: 0, repetitions: 0, dueAt: now, lapses: 0 };
    const existing: SavedWord[] = [
      {
        id: 'l1:t1',
        userId: 'local-user',
        language: 'el',
        surfaceForm: 'μένω',
        translation: 'жить',
        lessonId: 'l1',
        tokenId: 't1',
        review: reviewState,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'l2:t2',
        userId: 'local-user',
        language: 'fr',
        surfaceForm: 'habiter',
        translation: 'жить',
        lessonId: 'l2',
        tokenId: 't2',
        review: reviewState,
        createdAt: now,
        updatedAt: now,
      },
    ];
    const { repository } = makeMockRepo(existing);
    const { result } = renderHook(() => useSavedWords(repository));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.savedWords.filter((w) => w.language === 'el')).toHaveLength(1);
    expect(result.current.savedWords.filter((w) => w.language === 'fr')).toHaveLength(1);
  });

  it('мигрирует старые записи из localStorage один раз и не повторяет при следующем монтировании', async () => {
    const legacy = [{ lessonId: 'old-1', tokenId: 't5', displayText: 'bonjour', shortTranslation: 'привет', savedAt: Date.now() }];
    window.localStorage.setItem('context-reader:saved', JSON.stringify(legacy));

    const { repository, upsert } = makeMockRepo();
    const { result, unmount } = renderHook(() => useSavedWords(repository));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(upsert.mock.calls[0][0]).toMatchObject({ id: 'old-1:t5', surfaceForm: 'bonjour', translation: 'привет' });
    unmount();

    // Второе монтирование (например, при перезаходе в приложение) — миграция
    // не должна повториться, флаг уже стоит в localStorage.
    const { result: result2 } = renderHook(() => useSavedWords(repository));
    await waitFor(() => expect(result2.current.loading).toBe(false));
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
