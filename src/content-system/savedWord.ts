// Сохранённые слова — минимальный срез (по договорённости: "просто сохранять
// списки слов, тренировку доделаем потом"). Модель данных сразу включает
// поля будущего SRS-планировщика (ReviewState) — их дешевле заложить сейчас,
// чем мигрировать схему второй раз, когда дойдёт очередь до самой тренировки
// (см. PROGRESS.md, записка про SRS). Сама логика планирования (SM-2 и т.д.)
// и экран тренировки — НЕ этот шаг.

import { z } from 'zod';

export const PRACTICE_PHRASE_PROMPT_VERSION = 1;

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

// Слот-подсказка из AnnotationSummary.hint (см. src/types/lesson.ts). Забираем
// её в момент сохранения по той же причине, что relatedSource/-Translation:
// карточка слова в «Учить» переиспользует Bottom Sheet ридера целиком, а он
// рисует эту строку из hint — восстановить её задним числом неоткуда, кроме
// повторной генерации аннотации. Поле необязательное: у слов, сохранённых до
// этого изменения, hint отсутствует, и шит просто не рисует строку (он уже
// сейчас выводит hint условно).
export const annotationHintSchema = z.object({
  label: z.string(),
  source: z.string(),
  translation: z.string(),
});

export const practicePhraseSchema = z.object({
  source: z.string(),
  translation: z.string(),
  promptVersion: z.number().int().positive(),
  generatedAt: z.string(),
});
export type PracticePhrase = z.infer<typeof practicePhraseSchema>;

export const savedWordSchema = z.object({
  id: z.string(), // `${lessonId}:${tokenId}` — стабильный, см. wordId() в useSavedWords.ts
  userId: z.string(),
  language: z.string(), // фактический язык урока-источника — не нужен join через lessonId
  level: z.string().optional(),

  surfaceForm: z.string(), // как слово стоит в тексте (было displayText в SavedUnit)
  partOfSpeech: z.string().nullable().optional(),
  translation: z.string(),
  audioText: z.string().optional(), // summary.audioText — готовый текст для /api/speak-unit
  audioProvider: z.enum(['openai', 'elevenlabs']).optional(),

  // Целое предложение-источник (summary.context.source/.translation), НЕ
  // summary.context.selectedSource/.selectedTranslation — то было бы просто
  // повтором surfaceForm/translation. Нужно для будущей тренировки "в том же
  // контексте/фразе", не изолированным словом.
  contextSource: z.string().optional(),
  contextTranslation: z.string().optional(),

  // Связанная фраза (summary.context.relatedSource/-Translation). Для слов
  // закрытого класса (падежный артикль, приставка) в translation лежит не
  // перевод, а грамматическая пометка вида «артикль, дат. падеж, мн. число» —
  // сам смысл живёт ТОЛЬКО здесь («den Alpen» → «Альп»). Восстановить это
  // задним числом нельзя, поэтому забираем в момент сохранения, даже пока
  // тренировка не написана (та же логика, что с ReviewState выше).
  relatedSource: z.string().nullable().optional(),
  relatedTranslation: z.string().nullable().optional(),

  // Слот-подсказка (см. annotationHintSchema выше).
  hint: annotationHintSchema.nullable().optional(),

  // Снимок глоссы замораживается в момент сохранения, а промпт аннотаций
  // продолжает улучшаться (см. PROGRESS.md — «строительство» → «конструкция»).
  // Отметка позволяет позже найти карточки, собранные старым промптом, и
  // перегенерировать их по lessonId+tokenId, а не тренировать устаревшее.
  annotationPromptVersion: z.number().int().optional(),

  // Один раз сгенерированная короткая фраза для стабильного cloze. Старые
  // записи без неё доготавливаются лениво при первом входе в тренировку.
  practicePhrase: practicePhraseSchema.optional(),

  lessonId: z.string(),
  tokenId: z.string(),

  review: reviewStateSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavedWord = z.infer<typeof savedWordSchema>;
