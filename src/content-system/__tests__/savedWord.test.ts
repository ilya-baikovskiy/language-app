import { describe, expect, it } from 'vitest';
import { createInitialReviewState, savedWordSchema } from '../savedWord';

describe('savedWord', () => {
  it('createInitialReviewState — стартовое состояние без повторов, dueAt = now', () => {
    const now = new Date('2026-07-24T12:00:00.000Z');
    const state = createInitialReviewState(now);
    expect(state).toEqual({
      easeFactor: 2.5,
      intervalDays: 0,
      repetitions: 0,
      dueAt: '2026-07-24T12:00:00.000Z',
      lapses: 0,
    });
  });

  it('savedWordSchema принимает минимально необходимые поля (без опциональных)', () => {
    const now = '2026-07-24T00:00:00.000Z';
    const result = savedWordSchema.safeParse({
      id: 'l1:t1',
      userId: 'local-user',
      language: 'el',
      surfaceForm: 'μένω',
      translation: 'жить',
      lessonId: 'l1',
      tokenId: 't1',
      review: createInitialReviewState(new Date(now)),
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(true);
  });

  it('savedWordSchema отклоняет запись без review', () => {
    const now = '2026-07-24T00:00:00.000Z';
    const result = savedWordSchema.safeParse({
      id: 'l1:t1',
      userId: 'local-user',
      language: 'el',
      surfaceForm: 'μένω',
      translation: 'жить',
      lessonId: 'l1',
      tokenId: 't1',
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(false);
  });
});
