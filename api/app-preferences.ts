// Временный adapter для AppPreferences (см. docs/content-system-v1.2/06 §3.2,
// §6, 11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md §«Первая реализация storage»):
// Blob JSON через serverless API — предпочтительный путь для cross-device,
// пока не выбрана durable structured store (Storage Decision Gate ещё не
// пройден, см. STORAGE_DISCOVERY.md).
//
// Один пользователь продукта, нет auth (см. IMPLEMENTATION_DISCOVERY.md) —
// userId в теле запроса не проверяется, а просто используется как часть пути.
// Тот же read-modify-write паттерн без конкурентной защиты, что и в
// api/save-lesson.ts (единый пользователь делает это низким риском).

import { put, list } from '@vercel/blob';

export const maxDuration = 15;

function pathFor(userId: string): string {
  return `app-state/v1/users/${userId}/app-preferences/latest.json`;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const userId = new URL(request.url).searchParams.get('userId');
    if (!userId) return new Response('userId query param is required', { status: 400 });

    const { blobs } = await list({ prefix: pathFor(userId), limit: 1 });
    if (blobs.length === 0) return Response.json(null);
    const res = await fetch(blobs[0].url);
    if (!res.ok) return Response.json(null);
    return Response.json(await res.json());
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const preferences = await request.json();
    if (!preferences?.userId) return new Response('preferences.userId is required', { status: 400 });

    await put(pathFor(preferences.userId), JSON.stringify(preferences), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return Response.json(preferences);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}
