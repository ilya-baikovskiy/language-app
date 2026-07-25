// GET — индекс сохранённых уроков для экрана библиотеки. Читает тот же
// lessons/index.json, что пишет api/save-lesson.ts.

import { list } from '@vercel/blob';
import { fetchIndexBlobFresh } from '../lib/blob/blobIndex.js';

export const maxDuration = 15;

export async function GET(): Promise<Response> {
  try {
    const { blobs } = await list({ prefix: 'lessons/index.json', limit: 1 });
    if (blobs.length === 0) return Response.json([]);
    const res = await fetchIndexBlobFresh(blobs[0]);
    if (!res.ok) return Response.json([]);
    const index = await res.json();
    return Response.json(index);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}
