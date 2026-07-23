// Временный adapter для LanguageProfile — см. api/app-preferences.ts для
// обоснования (тот же Blob-via-API паттерн, тот же Storage Decision Gate).
//
// Расходится с буквальным REST-путём из 11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md
// («PATCH /api/language-profiles/:language»): в репозитории нет dynamic-route
// файлов ([param].ts) ни для одного текущего API-эндпоинта, и вводить их
// впервые ради одного маршрута рискованно без возможности проверить билд на
// Vercel в этой сессии. Вместо URL-параметра язык передаётся в теле PATCH.
// Минимальное совместимое отклонение — см. «Работа с расхождениями» в брифе.

import { put, list } from '@vercel/blob';

export const maxDuration = 15;

function pathFor(userId: string): string {
  return `app-state/v1/users/${userId}/language-profiles/latest.json`;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const userId = new URL(request.url).searchParams.get('userId');
    if (!userId) return new Response('userId query param is required', { status: 400 });

    const { blobs } = await list({ prefix: pathFor(userId), limit: 1 });
    if (blobs.length === 0) return Response.json([]);
    const res = await fetch(blobs[0].url);
    if (!res.ok) return Response.json([]);
    return Response.json(await res.json());
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const profile = await request.json();
    if (!profile?.userId || !profile?.language) {
      return new Response('profile.userId and profile.language are required', { status: 400 });
    }

    const { blobs } = await list({ prefix: pathFor(profile.userId), limit: 1 });
    const existing = blobs.length > 0 ? await (await fetch(blobs[0].url)).json() : [];
    const next = [profile, ...existing.filter((p: { language: string }) => p.language !== profile.language)];

    await put(pathFor(profile.userId), JSON.stringify(next), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return Response.json(profile);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}
