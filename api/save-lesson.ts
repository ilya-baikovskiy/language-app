// Шаг 7 пайплайна — сохраняет собранный урок в Vercel Blob и добавляет его
// в общий индекс (lessons/index.json), который читает api/lessons.ts для
// библиотеки. Без отдельной базы данных — индекс сам по себе просто Blob.

import { put, list } from '@vercel/blob';
import type { AudioProvider, Lesson } from '../src/types/lesson.js';

export const maxDuration = 30;

const INDEX_PATHNAME = 'lessons/index.json';

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
    const { lesson, audioUrl } = (await request.json()) as { lesson: Lesson; audioUrl: string };
    const slug = lesson.id;

    const lessonBlob = await put(`lessons/${slug}.json`, JSON.stringify(lesson), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    const index = await readIndex();
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
