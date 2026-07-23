// Immutable analytics event batch storage — see
// docs/content-system-v1.2/06_DATA_MODEL_AND_STORAGE.md §3.5. Unlike
// save-lesson.ts/app-preferences.ts/language-profiles.ts, this endpoint never
// reads an existing index and rewrites it — every batch is a brand-new file,
// written once, never overwritten:
//
//   events/v1/{userId}/{yyyy-mm-dd}/{batchId}.json
//
// `duplicateCount` is always 0 here: there is no query/index infrastructure
// yet to detect an already-ingested batch or event id (see 06 §3.5 "неудобные
// запросы" / "сложно пересчитывать" — this is an honest placeholder, not a
// claim that real dedup happens).

import { put } from '@vercel/blob';
import type { AnalyticsEvent } from '../src/content-system/analyticsEvent';

export const maxDuration = 15;

export async function POST(request: Request): Promise<Response> {
  try {
    const { events } = (await request.json()) as { events: AnalyticsEvent[] };
    if (!Array.isArray(events) || events.length === 0) {
      return new Response('events must be a non-empty array', { status: 400 });
    }

    // batchId generated server-side per the brief ("crypto.randomUUID() на
    // сервере (или прими с клиента, если проще ... но должен быть уникален)")
    // — server-side avoids trusting a client-provided id for the storage path.
    const batchId = crypto.randomUUID();
    const dateStamp = new Date().toISOString().slice(0, 10); // yyyy-mm-dd, UTC
    const userId = events[0]?.userId ?? 'unknown-user';

    await put(`events/v1/${userId}/${dateStamp}/${batchId}.json`, JSON.stringify(events), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: false,
    });

    return Response.json({ acceptedCount: events.length, duplicateCount: 0 });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}
