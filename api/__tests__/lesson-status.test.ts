// Регрессия на потерю уже сгенерированного урока (2026-07-29): запись индекса
// осталась в 'creating' при полностью сохранённом уроке, «Продолжить» в
// библиотеке запускала генерацию заново, и `put` затирал прочитанный текст.
// Ключевое требование: 'start' обязан смотреть на сами блобы, а не на статус.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const blobStore = vi.hoisted(() => ({
  // pathname -> url
  files: new Map<string, string>(),
  writes: [] as { pathname: string; body: string }[],
}));

vi.mock('@vercel/blob', () => ({
  list: vi.fn(async ({ prefix }: { prefix: string }) => ({
    blobs: [...blobStore.files.entries()]
      .filter(([pathname]) => pathname.startsWith(prefix))
      .map(([pathname, url]) => ({ pathname, url })),
  })),
  put: vi.fn(async (pathname: string, body: string) => {
    blobStore.files.set(pathname, `https://blob.test/${pathname}`);
    blobStore.writes.push({ pathname, body });
    return { url: `https://blob.test/${pathname}` };
  }),
}));

const { POST } = await import('../lesson-status');

const LESSON_ID = 'card-gen-croissants-el-A2';

const savedLesson = {
  id: LESSON_ID,
  language: 'Greek',
  languageCode: 'el',
  sourceLanguage: 'Russian',
  level: 'A2',
  title: 'Η Γαλλία και η κουλτούρα των κρουασάν',
  translatedTitle: 'Франция и культура круассанов',
  estimatedMinutes: 3,
  paragraphs: [],
  annotations: [],
  audioProvider: 'elevenlabs',
};

function startRequest() {
  return new Request('https://example.test/api/lesson-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'start',
      entry: {
        id: LESSON_ID,
        slug: LESSON_ID,
        // Русский редакторский заголовок карточки — НЕ настоящий заголовок урока.
        title: 'Круассаны во Франции',
        level: 'A2',
        estimatedMinutes: 2,
        languageCode: 'el',
        cardId: 'gen-croissants',
        blueprintId: 'bp-1',
      },
    }),
  });
}

function writtenIndex() {
  const write = [...blobStore.writes].reverse().find((w) => w.pathname === 'lessons/index.json');
  return write ? (JSON.parse(write.body) as Record<string, unknown>[]) : null;
}

function seedIndex(entries: Record<string, unknown>[]) {
  blobStore.files.set('lessons/index.json', 'https://blob.test/lessons/index.json');
  indexBody = JSON.stringify(entries);
}

let indexBody = '[]';

beforeEach(() => {
  blobStore.files.clear();
  blobStore.writes.length = 0;
  indexBody = '[]';
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('lessons/index.json')) {
      return new Response(indexBody, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes(`lessons/${LESSON_ID}.json`)) {
      return new Response(JSON.stringify(savedLesson), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }));
});

describe("/api/lesson-status action 'start'", () => {
  it('не затирает уже сохранённый урок, а восстанавливает запись в ready', async () => {
    // Урок и его аудио сохранены целиком, но индекс завис в 'creating' с
    // обнулёнными ссылками — ровно то состояние, в котором библиотека
    // показывала «Продолжить».
    blobStore.files.set(`lessons/${LESSON_ID}.json`, `https://blob.test/lessons/${LESSON_ID}.json`);
    blobStore.files.set(`audio/${LESSON_ID}.mp3`, `https://blob.test/audio/${LESSON_ID}.mp3`);
    seedIndex([
      {
        id: LESSON_ID,
        slug: LESSON_ID,
        title: 'Круассаны во Франции',
        level: 'A2',
        estimatedMinutes: 2,
        lessonUrl: '',
        audioUrl: '',
        createdAt: '2026-07-29T20:00:00.000Z',
        status: 'creating',
        cardId: 'gen-croissants',
      },
    ]);

    const response = await POST(startRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, alreadyComplete: true });

    const index = writtenIndex();
    expect(index).toHaveLength(1);
    expect(index?.[0]).toMatchObject({
      id: LESSON_ID,
      status: 'ready',
      lessonUrl: `https://blob.test/lessons/${LESSON_ID}.json`,
      audioUrl: `https://blob.test/audio/${LESSON_ID}.mp3`,
      // Метаданные из самого урока, не из placeholder-запроса.
      title: savedLesson.title,
      estimatedMinutes: 3,
      // Дата первого создания сохраняется.
      createdAt: '2026-07-29T20:00:00.000Z',
    });
  });

  it('ставит placeholder, когда готового урока действительно нет', async () => {
    seedIndex([]);

    const response = await POST(startRequest());
    expect(await response.json()).toEqual({ ok: true, alreadyComplete: false });

    const index = writtenIndex();
    expect(index).toHaveLength(1);
    expect(index?.[0]).toMatchObject({
      id: LESSON_ID,
      status: 'creating',
      lessonUrl: '',
      audioUrl: '',
    });
  });

  it('генерирует заново, если урок есть, а его аудио нет — такую запись нельзя открыть', async () => {
    blobStore.files.set(`lessons/${LESSON_ID}.json`, `https://blob.test/lessons/${LESSON_ID}.json`);
    seedIndex([]);

    const response = await POST(startRequest());
    expect(await response.json()).toEqual({ ok: true, alreadyComplete: false });
    expect(writtenIndex()?.[0]).toMatchObject({ status: 'creating' });
  });

  it('не оставляет вторую запись того же урока', async () => {
    seedIndex([
      { id: LESSON_ID, slug: LESSON_ID, title: 'старая', level: 'A2', estimatedMinutes: 2, lessonUrl: '', audioUrl: '', createdAt: '2026-07-01T00:00:00.000Z', status: 'failed' },
      { id: 'other-lesson', slug: 'other-lesson', title: 'другой', level: 'A1', estimatedMinutes: 4, lessonUrl: 'u', audioUrl: 'a', createdAt: '2026-07-02T00:00:00.000Z', status: 'ready' },
    ]);

    await POST(startRequest());

    const index = writtenIndex();
    expect(index?.filter((e) => e.id === LESSON_ID)).toHaveLength(1);
    expect(index?.find((e) => e.id === 'other-lesson')).toMatchObject({ status: 'ready' });
  });
});
