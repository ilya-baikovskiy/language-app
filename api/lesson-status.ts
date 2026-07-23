// PR 3 (card → Lesson) — idempotent library-status transitions on top of the
// same lessons/index.json that api/save-lesson.ts writes. Two actions only:
// `start` (creating a 'creating' placeholder before generation begins) and
// `fail` (marking a lesson 'failed' if generation throws). The success
// transition creating -> ready is NOT here — it happens inside
// api/save-lesson.ts, which already runs at the end of the existing
// generateLesson pipeline (see src/content-system/cardGeneration.ts).
//
// No full GenerationJob state machine (07 §8) — intentionally out of scope
// for this PR, see 11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md.

import { put, list } from '@vercel/blob';
import type { AudioProvider } from '../src/types/lesson.js';

export const maxDuration = 15;

const INDEX_PATHNAME = 'lessons/index.json';

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

type StartBody = {
  action: 'start';
  entry: {
    id: string;
    slug: string;
    title: string;
    translatedTitle?: string;
    level: string;
    estimatedMinutes: number;
    languageCode?: string;
    cardId: string;
    blueprintId: string;
  };
};

type FailBody = { action: 'fail'; lessonId: string };

async function readIndex(): Promise<LessonIndexEntry[]> {
  const { blobs } = await list({ prefix: INDEX_PATHNAME, limit: 1 });
  if (blobs.length === 0) return [];
  const res = await fetch(blobs[0].url);
  if (!res.ok) return [];
  return (await res.json()) as LessonIndexEntry[];
}

async function writeIndex(index: LessonIndexEntry[]): Promise<void> {
  await put(INDEX_PATHNAME, JSON.stringify(index), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as StartBody | FailBody;
    const index = await readIndex();

    if (body.action === 'start') {
      const { entry } = body;
      // No lessonUrl/audioUrl yet — LibraryPage must not try to open a
      // 'creating' entry (see LibraryPage.tsx status handling).
      const placeholder: LessonIndexEntry = {
        id: entry.id,
        slug: entry.slug,
        title: entry.title,
        translatedTitle: entry.translatedTitle,
        level: entry.level,
        estimatedMinutes: entry.estimatedMinutes,
        lessonUrl: '',
        audioUrl: '',
        languageCode: entry.languageCode,
        createdAt: new Date().toISOString(),
        status: 'creating',
        cardId: entry.cardId,
        blueprintId: entry.blueprintId,
      };
      const nextIndex = [placeholder, ...index.filter((e) => e.id !== entry.id && e.slug !== entry.slug)];
      await writeIndex(nextIndex);
      return Response.json({ ok: true });
    }

    if (body.action === 'fail') {
      const nextIndex = index.map((e) =>
        e.id === body.lessonId || e.slug === body.lessonId ? { ...e, status: 'failed' as LessonStatus } : e,
      );
      await writeIndex(nextIndex);
      return Response.json({ ok: true });
    }

    return new Response('Unknown action', { status: 400 });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}
