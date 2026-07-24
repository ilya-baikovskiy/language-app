// Сохранённые слова — минимальный срез (по договорённости: "просто сохранять
// списки слов, тренировку доделаем потом"). Модель данных сразу включает
// поля будущего SRS-планировщика (ReviewState) — их дешевле заложить сейчас,
// чем мигрировать схему второй раз, когда дойдёт очередь до самой тренировки
// (см. PROGRESS.md, записка про SRS). Сама логика планирования (SM-2 и т.д.)
// и экран тренировки — НЕ этот шаг.

import { z } from 'zod';

export const reviewStateSchema = z.object({
  easeFactor: z.number().min(1.3),
  intervalDays: z.number().nonnegative(),
  repetitions: z.number().int().nonnegative(),
  dueAt: z.string(),
  lastReviewedAt: z.string().optional(),
  lapses: z.number().int().nonnegative(),
});
export type ReviewState = z.infer<typeof reviewStateSchema>;

export function createInitialReviewState(now: Date = new Date()): ReviewState {
  return { easeFactor: 2.5, intervalDays: 0, repetitions: 0, dueAt: now.toISOString(), lapses: 0 };
}

export const savedWordSchema = z.object({
  id: z.string(), // `${lessonId}:${tokenId}` — стабильный, см. wordId() в useSavedWords.ts
  userId: z.string(),
  language: z.string(), // фактический язык урока-источника — не нужен join через lessonId
  level: z.string().optional(),

  surfaceForm: z.string(), // как слово стоит в тексте (было displayText в SavedUnit)
  partOfSpeech: z.string().nullable().optional(),
  translation: z.string(),
  audioText: z.string().optional(), // summary.audioText — готовый текст для /api/speak-unit

  contextSource: z.string().optional(), // summary.context.selectedSource
  contextTranslation: z.string().optional(), // summary.context.selectedTranslation

  lessonId: z.string(),
  tokenId: z.string(),

  review: reviewStateSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavedWord = z.infer<typeof savedWordSchema>;
