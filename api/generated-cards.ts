// Хранилище пула AI-сгенерированных карточек (Pipeline A) — глобальный,
// НЕ per-user: ContentCard это canonical cross-language идея, не
// принадлежит одному пользователю (см. 07 §1, 06). Тот же
// read-modify-write паттерн, что api/language-profiles.ts.

import { put, list } from '@vercel/blob';

export const maxDuration = 15;

const POOL_PATH = 'content-system/v1/generated-cards/pool.v1.json';

export async function GET(): Promise<Response> {
  try {
    const { blobs } = await list({ prefix: POOL_PATH, limit: 1 });
    if (blobs.length === 0) return Response.json([]);
    const res = await fetch(blobs[0].url);
    if (!res.ok) return Response.json([]);
    return Response.json(await res.json());
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { cards } = (await request.json()) as { cards: Array<{ id: string; canonicalSubjectKey: string }> };
    if (!Array.isArray(cards) || cards.length === 0) {
      return new Response('cards (non-empty array) is required', { status: 400 });
    }

    const { blobs } = await list({ prefix: POOL_PATH, limit: 1 });
    const existing: Array<{ id: string; canonicalSubjectKey: string }> =
      blobs.length > 0 ? await (await fetch(blobs[0].url)).json() : [];

    const existingKeys = new Set(existing.map((c) => c.canonicalSubjectKey));
    const toAdd = cards.filter((c) => !existingKeys.has(c.canonicalSubjectKey));
    const next = [...existing, ...toAdd];

    await put(POOL_PATH, JSON.stringify(next), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return Response.json({ added: toAdd.length, total: next.length });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}
