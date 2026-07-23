// Шаг 7 пайплайна — сохраняет собранный урок в Vercel Blob и добавляет его
// в общий индекс (lessons/index.json), который читает api/lessons.ts для
// библиотеки. Без отдельной базы данных — индекс сам по себе просто Blob.

import { put, list } from '@vercel/blob';
import type { AudioProvider, Lesson } from '../src/types/lesson.js';

export const maxDuration = 30;

const INDEX_PATHNAME = 'lessons/index.json';

// 'creating'/'failed' — статусы placeholder-записей из api/lesson-status.ts
// (PR 3, card → Lesson). Этот эндпоинт всегда пишет успешный финал —
// 'ready' — но тип отражает все возможные значения индекса.
type LessonStatus = 'creating' | 'ready' | 'started' | 'completed' | 'failed';

type LessonIndexEntry = {
  id: string;
  slug: string;
  title: string;
  translatedTitle?: string;
  level: string;
  estimatedMinutes: number;
  lessonUrl: string;
  audioUrl: string;
  audioProvider?: AudioProvider;
  languageCode?: string;
  createdAt: string;
  status: LessonStatus;
  cardId?: string;
  blueprintId?: string;
};

async function readIndex(): Promise<LessonIndexEntry[]> {
  const { blobs } = await list({ prefix: INDEX_PATHNAME, limit: 1 });
  if (blobs.length === 0) return [];
  const res = await fetch(blobs[0].url);
  if (!res.ok) return [];
  return (await res.json()) as LessonIndexEntry[];
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { lesson, audioUrl, cardId, blueprintId } = (await request.json()) as {
      lesson: Lesson;
      audioUrl: string;
      // Опциональные — только у card → Lesson флоу (PR 3). Не переданы явно
      // клиентом в этом PR (см. cardGeneration.ts) — вместо этого сохраняются
      // из уже существующей 'creating'-записи (см. ниже), которую создаёт
      // api/lesson-status.ts до начала генерации. Тело запроса всё же
      // принимает их напрямую — для прямых вызовов этого эндпоинта в будущем.
      cardId?: string;
      blueprintId?: string;
    };
    const slug = lesson.id;

    const lessonBlob = await put(`lessons/${slug}.json`, JSON.stringify(lesson), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    const index = await readIndex();
    const existing = index.find((e) => e.slug === slug || e.id === lesson.id);
    const entry: LessonIndexEntry = {
      id: lesson.id,
      slug,
      title: lesson.title,
      translatedTitle: lesson.translatedTitle,
      level: lesson.level,
      estimatedMinutes: lesson.estimatedMinutes,
      lessonUrl: lessonBlob.url,
      audioUrl,
      audioProvider: lesson.audioProvider,
      languageCode: lesson.languageCode,
      createdAt: new Date().toISOString(),
      status: 'ready',
      cardId: cardId ?? existing?.cardId,
      blueprintId: blueprintId ?? existing?.blueprintId,
    };
    const nextIndex = [entry, ...index.filter((e) => e.slug !== slug)];

    await put(INDEX_PATHNAME, JSON.stringify(nextIndex), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return Response.json({ slug, lessonUrl: lessonBlob.url });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}
