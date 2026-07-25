// GET — индекс сохранённых уроков для экрана библиотеки. Читает тот же
// lessons/index.json, что пишет api/save-lesson.ts.

import { list } from '@vercel/blob';
import { fetchIndexBlobFresh } from '../lib/blob/blobIndex.js';

export const maxDuration = 15;

// Индекс — изменяемое состояние ('creating' → 'ready'), а не статический
// ассет. Дефолт Vercel для функции — `public, max-age=0, must-revalidate`:
// «public» разрешает промежуточным кэшам и браузеру хранить ответ, и
// библиотека реально показывала статус уроков минутной давности (урок уже
// 'ready' на сервере, а в приложении всё ещё «Готовится…»). Для статуса
// единственный корректный режим — не кэшировать вовсе.
const NO_STORE = { 'cache-control': 'no-store, max-age=0' };

export async function GET(): Promise<Response> {
  try {
    const { blobs } = await list({ prefix: 'lessons/index.json', limit: 1 });
    if (blobs.length === 0) return Response.json([]);
    const res = await fetchIndexBlobFresh(blobs[0]);
    if (!res.ok) return Response.json([], { headers: NO_STORE });
    const index = await res.json();
    return Response.json(index, { headers: NO_STORE });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}
