import { describe, expect, it } from 'vitest';
import {
  classifyReviewAnswer,
  isDue,
  isLeech,
  isNewWord,
  scheduleNext,
  selectPracticeQueue,
  wordStatus,
} from '../srs';
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

describe('wordStatus', () => {
  it('«Новое» — только пока слово ни разу не тренировалось', () => {
    expect(wordStatus(word('a', review()))).toBe('new');
    // Ошибка на первой же попытке уже не «Новое»: lastReviewedAt проставлен,
    // а lapses вырос — слово перешло в работу.
    expect(
      wordStatus(word('a', review({ lastReviewedAt: NOW.toISOString(), intervalDays: 1, lapses: 1 }))),
    ).toBe('learning');
  });

  it('«Знаю» начинается с интервала 21 день, ниже — «Учу»', () => {
    const reviewed = { lastReviewedAt: NOW.toISOString(), repetitions: 4 };
    expect(wordStatus(word('a', review({ ...reviewed, intervalDays: 20 })))).toBe('learning');
    expect(wordStatus(word('a', review({ ...reviewed, intervalDays: 21 })))).toBe('known');
    expect(wordStatus(word('a', review({ ...reviewed, intervalDays: 90 })))).toBe('known');
  });

  it('не терминален: ошибка в повторе возвращает выученное слово в «Учу»', () => {
    const known = word('a', review({ lastReviewedAt: NOW.toISOString(), repetitions: 5, intervalDays: 40 }));
    expect(wordStatus(known)).toBe('known');
    const afterMistake = { ...known, review: scheduleNext(known.review, 'again', NOW) };
    expect(wordStatus(afterMistake)).toBe('learning');
  });
});

describe('isLeech', () => {
  it('помечает слово сложным с четвёртой ошибки, не раньше', () => {
    expect(isLeech(word('a', review({ lapses: 3 })))).toBe(false);
    expect(isLeech(word('a', review({ lapses: 4 })))).toBe(true);
  });
});

describe('isDue', () => {
  it('слово к повтору, когда dueAt уже наступил', () => {
    expect(isDue(word('a', review({ dueAt: NOW.toISOString() })), NOW)).toBe(true);
    expect(isDue(word('a', review({ dueAt: '2026-07-27T12:00:00.000Z' })), NOW)).toBe(true);
    expect(isDue(word('a', review({ dueAt: '2026-07-29T12:00:00.000Z' })), NOW)).toBe(false);
  });

  it('согласован с составом очереди — в неё попадает ровно то, что к повтору', () => {
    const words = [
      word('due', review({ dueAt: '2026-07-27T12:00:00.000Z', lastReviewedAt: NOW.toISOString(), repetitions: 2, intervalDays: 3 })),
      word('later', review({ dueAt: '2026-08-05T12:00:00.000Z', lastReviewedAt: NOW.toISOString(), repetitions: 2, intervalDays: 8 })),
    ];
    const queue = selectPracticeQueue(words, NOW);
    expect(queue.map((w) => w.id)).toEqual(['due']);
    expect(words.filter((w) => isDue(w, NOW)).map((w) => w.id)).toEqual(['due']);
  });
});

describe('isNewWord', () => {
  it('новое слово попадает в очередь сразу после сохранения', () => {
    const fresh = word('fresh', review());
    expect(isNewWord(fresh)).toBe(true);
    expect(selectPracticeQueue([fresh], NOW).map((w) => w.id)).toEqual(['fresh']);
  });
});
