// Объединяет api/app-preferences.ts, api/language-profiles.ts и (теперь)
// сохранённые слова в один файл — все три были/остаются почти идентичным
// Blob-CRUD-адаптером (один JSON-массив/объект per userId), а Vercel
// Hobby-план считает функции по файлам под api/ (лимит 12, см. git log —
// Pipeline A уже один раз упирался в этот лимит). Новый kind='saved-words'
// добавлен сюда же, а не отдельным файлом, по той же причине.

import { put, list } from '@vercel/blob';

export const maxDuration = 15;

type Kind = 'preferences' | 'profiles' | 'saved-words';

function pathFor(kind: Kind, userId: string): string {
  const segment = kind === 'preferences' ? 'app-preferences' : kind === 'profiles' ? 'language-profiles' : 'saved-words';
  const namespace = kind === 'saved-words' ? 'learning/v1' : 'app-state/v1';
  return `${namespace}/users/${userId}/${segment}/latest.json`;
}

function parseKind(value: string | null): Kind | null {
  return value === 'preferences' || value === 'profiles' || value === 'saved-words' ? value : null;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const kind = parseKind(url.searchParams.get('kind'));
    const userId = url.searchParams.get('userId');
    if (!kind) return new Response('kind query param must be "preferences", "profiles" or "saved-words"', { status: 400 });
    if (!userId) return new Response('userId query param is required', { status: 400 });

    const { blobs } = await list({ prefix: pathFor(kind, userId), limit: 1 });
    const empty = kind === 'preferences' ? null : [];
    if (blobs.length === 0) return Response.json(empty);
    const res = await fetch(blobs[0].url);
    if (!res.ok) return Response.json(empty);
    return Response.json(await res.json());
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const kind = parseKind(url.searchParams.get('kind'));
    if (!kind) return new Response('kind query param must be "preferences", "profiles" or "saved-words"', { status: 400 });

    if (kind === 'preferences') {
      const preferences = await request.json();
      if (!preferences?.userId) return new Response('preferences.userId is required', { status: 400 });
      await put(pathFor('preferences', preferences.userId), JSON.stringify(preferences), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return Response.json(preferences);
    }

    if (kind === 'profiles') {
      const profile = await request.json();
      if (!profile?.userId || !profile?.language) {
        return new Response('profile.userId and profile.language are required', { status: 400 });
      }
      const { blobs } = await list({ prefix: pathFor('profiles', profile.userId), limit: 1 });
      const existing = blobs.length > 0 ? await (await fetch(blobs[0].url)).json() : [];
      const next = [profile, ...existing.filter((p: { language: string }) => p.language !== profile.language)];
      await put(pathFor('profiles', profile.userId), JSON.stringify(next), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return Response.json(profile);
    }

    // kind === 'saved-words': upsert по id (не по language, как profiles —
    // одно слово это одна запись, не одна запись на язык).
    const word = await request.json();
    if (!word?.userId || !word?.id) {
      return new Response('word.userId and word.id are required', { status: 400 });
    }
    const { blobs } = await list({ prefix: pathFor('saved-words', word.userId), limit: 1 });
    const existing: Array<{ id: string }> = blobs.length > 0 ? await (await fetch(blobs[0].url)).json() : [];
    const next = [word, ...existing.filter((w) => w.id !== word.id)];
    await put(pathFor('saved-words', word.userId), JSON.stringify(next), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return Response.json(word);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const kind = parseKind(url.searchParams.get('kind'));
    const userId = url.searchParams.get('userId');
    const id = url.searchParams.get('id');
    if (kind !== 'saved-words') return new Response('DELETE only supports kind="saved-words"', { status: 400 });
    if (!userId || !id) return new Response('userId and id query params are required', { status: 400 });

    const path = pathFor('saved-words', userId);
    const { blobs } = await list({ prefix: path, limit: 1 });
    if (blobs.length === 0) return Response.json({ removed: false });
    const existing: Array<{ id: string }> = await (await fetch(blobs[0].url)).json();
    const next = existing.filter((w) => w.id !== id);
    // Пустой массив всё равно валиден как JSON-файл — просто перезаписываем,
    // не нужен отдельный del() для одного пользователя без параллельных записей.
    await put(path, JSON.stringify(next), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return Response.json({ removed: existing.length !== next.length });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}
