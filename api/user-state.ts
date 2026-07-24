// Объединяет api/app-preferences.ts и api/language-profiles.ts в один файл —
// оба были почти идентичным Blob-CRUD-адаптером (GET+PATCH одного JSON per
// userId), а Vercel Hobby-план считает функции по файлам под api/ (лимит 12).
// Добавление Pipeline A (generated-cards.ts) вывело проект за лимит —
// объединение этих двух эндпоинтов в один освобождает слот без изменения
// поведения для клиента (см. blobAppPreferencesRepository.ts/
// blobLanguageProfileRepository.ts — только меняется URL, форма
// запроса/ответа та же). См. также историю обоих файлов в git log для полного
// обоснования паттерна (Storage Decision Gate, единый пользователь без auth).

import { put, list } from '@vercel/blob';

export const maxDuration = 15;

type Kind = 'preferences' | 'profiles';

function pathFor(kind: Kind, userId: string): string {
  const segment = kind === 'preferences' ? 'app-preferences' : 'language-profiles';
  return `app-state/v1/users/${userId}/${segment}/latest.json`;
}

function parseKind(value: string | null): Kind | null {
  return value === 'preferences' || value === 'profiles' ? value : null;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const kind = parseKind(url.searchParams.get('kind'));
    const userId = url.searchParams.get('userId');
    if (!kind) return new Response('kind query param must be "preferences" or "profiles"', { status: 400 });
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
    if (!kind) return new Response('kind query param must be "preferences" or "profiles"', { status: 400 });

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
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}
