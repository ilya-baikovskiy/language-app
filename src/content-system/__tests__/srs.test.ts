import { describe, expect, it } from 'vitest';
import { classifyReviewAnswer, scheduleNext, selectPracticeQueue } from '../srs';
import type { ReviewState, SavedWord } from '../savedWord';

const NOW = new Date('2026-07-28T12:00:00.000Z');

function review(overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    dueAt: NOW.toISOString(),
    lapses: 0,
    ...overrides,
  };
}

function word(id: string, reviewState: ReviewState, createdAt = NOW.toISOString()): SavedWord {
  return {
    id,
    userId: 'local-user',
    language: 'el',
    surfaceForm: id,
    translation: id,
    lessonId: 'lesson',
    tokenId: id,
    review: reviewState,
    createdAt,
    updatedAt: createdAt,
  };
}

describe('classifyReviewAnswer', () => {
  it('сначала учитывает подсказку, затем точное совпадение', () => {
    expect(classifyReviewAnswer('κατασκευή', 'κατασκευή', true)).toBe('again');
    expect(classifyReviewAnswer(' ΚΑΤΑΣΚΕΥΉ ', 'κατασκευή', false)).toBe('good');
  });

  it('небольшую ошибку в форме считает «Почти», другое слово — «Не совсем»', () => {
    expect(classifyReviewAnswer('κατασκευές', 'κατασκευή', false)).toBe('almost');
    expect(classifyReviewAnswer('σπίτι', 'κατασκευή', false)).toBe('again');
    expect(classifyReviewAnswer('', 'κατασκευή', false)).toBe('again');
  });
});

describe('scheduleNext', () => {
  it('успех идёт по лестнице 1 → 6 → предыдущий×EF', () => {
    const first = scheduleNext(review(), 'good', NOW);
    expect(first).toMatchObject({ repetitions: 1, intervalDays: 1, easeFactor: 2.6, lapses: 0 });

    const second = scheduleNext(first, 'good', NOW);
    expect(second).toMatchObject({ repetitions: 2, intervalDays: 6, easeFactor: 2.7 });

    const third = scheduleNext(second, 'good', NOW);
    expect(third).toMatchObject({ repetitions: 3, intervalDays: 17, easeFactor: 2.8 });
  });

  it('«Почти» сохраняет успех, но уменьшает easeFactor', () => {
    expect(scheduleNext(review(), 'almost', NOW)).toMatchObject({
      repetitions: 1,
      intervalDays: 1,
      easeFactor: 2.35,
      lapses: 0,
    });
  });

  it('провал сбрасывает лестницу, добавляет lapse и не опускает EF ниже 1.3', () => {
    expect(scheduleNext(review({ easeFactor: 1.35, repetitions: 4, intervalDays: 20, lapses: 2 }), 'again', NOW)).toMatchObject({
      repetitions: 0,
      intervalDays: 1,
      easeFactor: 1.3,
      lapses: 3,
      dueAt: '2026-07-29T12:00:00.000Z',
    });
  });
});

describe('selectPracticeQueue', () => {
  it('берёт все due-повторы, максимум 10 новых и не берёт будущие', () => {
    const past = '2026-07-27T12:00:00.000Z';
    const reviewed = word('reviewed', review({ dueAt: past, lastReviewedAt: past, repetitions: 2, intervalDays: 6 }));
    const newWords = Array.from({ length: 12 }, (_, i) =>
      word(`new-${i}`, review({ dueAt: past }), new Date(NOW.getTime() + i * 1000).toISOString()),
    );
    const future = word('future', review({ dueAt: '2026-07-30T12:00:00.000Z', lastReviewedAt: past }));

    const queue = selectPracticeQueue([future, ...newWords, reviewed], NOW);
    expect(queue[0].id).toBe('reviewed');
    expect(queue.filter((item) => item.id.startsWith('new-'))).toHaveLength(10);
    expect(queue.map((item) => item.id)).not.toContain('future');
  });
});
