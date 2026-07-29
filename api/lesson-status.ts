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
import type { AudioProvider, Lesson } from '../src/types/lesson.js';
import { fetchJsonBlobFresh, fetchIndexBlobFresh, MUTABLE_BLOB_CACHE_SECONDS } from '../lib/blob/blobIndex.js';

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
  const res = await fetchIndexBlobFresh(blobs[0]);
  if (!res.ok) return [];
  return (await res.json()) as LessonIndexEntry[];
}

// Точное совпадение pathname, а не просто prefix: list() отдаёт всё, что
// начинается с префикса, и `lessons/foo.json` матчился бы префиксом
// `lessons/foo` — для проверки «этот урок уже сохранён» это ложное срабатывание.
async function findBlobUrl(pathname: string): Promise<string | null> {
  const { blobs } = await list({ prefix: pathname, limit: 100 });
  return blobs.find((blob) => blob.pathname === pathname)?.url ?? null;
}

async function writeIndex(index: LessonIndexEntry[]): Promise<void> {
  await put(INDEX_PATHNAME, JSON.stringify(index), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: MUTABLE_BLOB_CACHE_SECONDS,
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as StartBody | FailBody;
    const index = await readIndex();

    if (body.action === 'start') {
      const { entry } = body;
      const existing = index.find((e) => e.id === entry.id || e.slug === entry.slug);
      const others = index.filter((e) => e.id !== entry.id && e.slug !== entry.slug);

      // СНАЧАЛА проверяем сами блобы, а не статус в индексе. Урок с этим id
      // может быть уже полностью сгенерирован и читаем, а запись в индексе всё
      // равно висеть в 'creating': этот эндпоинт и api/save-lesson.ts правят
      // один блоб индекса без compare-and-swap, так что запись 'ready' можно
      // потерять. Раньше мы в этом случае безусловно писали поверх пустой
      // placeholder (lessonUrl: '', audioUrl: ''), клиент считал, что урока
      // нет, генерировал заново — и `put` затирал уже прочитанный текст
      // пользователя без возможности восстановления.
      const lessonUrl = await findBlobUrl(`lessons/${entry.id}.json`);
      const audioUrl = lessonUrl
        ? (await findBlobUrl(`audio/${entry.id}.mp3`)) ?? existing?.audioUrl ?? ''
        : '';

      // Нужны оба блоба: без аудио ридер урок не отдаёт, такую запись
      // восстанавливать как 'ready' нельзя — честнее сгенерировать заново.
      if (lessonUrl && audioUrl) {
        const res = await fetchJsonBlobFresh({ url: lessonUrl });
        if (res.ok) {
          // Метаданные берём из самого урока, а не из placeholder-запроса: в
          // запросе title — русский редакторский заголовок карточки, а
          // estimatedMinutes — прикидка по темпу чтения. Так восстановленная
          // запись совпадает с тем, что записал бы api/save-lesson.ts.
          const lesson = (await res.json()) as Lesson;
          const repaired: LessonIndexEntry = {
            id: lesson.id,
            slug: lesson.id,
            title: lesson.title,
            translatedTitle: lesson.translatedTitle,
            level: lesson.level,
            estimatedMinutes: lesson.estimatedMinutes,
            lessonUrl,
            audioUrl,
            audioProvider: lesson.audioProvider,
            languageCode: lesson.languageCode ?? entry.languageCode,
            createdAt: existing?.createdAt ?? new Date().toISOString(),
            status: 'ready',
            cardId: entry.cardId ?? existing?.cardId,
            blueprintId: entry.blueprintId ?? existing?.blueprintId,
          };
          await writeIndex([repaired, ...others]);
          return Response.json({ ok: true, alreadyComplete: true });
        }
      }

      // Готового урока нет — только теперь ставим placeholder. Без
      // lessonUrl/audioUrl: LibraryPage не должен пытаться открыть
      // 'creating'-запись (см. обработку статусов в LibraryPage.tsx).
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
        // Свежая дата именно здесь и уместна: это новая попытка генерации, и
        // isStaleCreating (LibraryPage.tsx) должен отсчитывать её срок от неё.
        createdAt: new Date().toISOString(),
        status: 'creating',
        cardId: entry.cardId,
        blueprintId: entry.blueprintId,
      };
      await writeIndex([placeholder, ...others]);
      return Response.json({ ok: true, alreadyComplete: false });
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
