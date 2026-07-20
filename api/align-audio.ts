// Шаг 6b пайплайна как HTTP-эндпоинт — Whisper + выравнивание, отдельно от
// TTS (api/generate-audio.ts). Скачивает аудио по уже загруженному в Blob
// URL, а не принимает байты в теле запроса.

import { transcribeAndAlign } from '../lib/pipeline/generateAudio.ts';
import { getLanguageConfig } from '../lib/pipeline/languageConfig.ts';
import type { Token } from '../src/types/lesson.ts';

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response('Server misconfigured: OPENAI_API_KEY missing', { status: 500 });

  try {
    const { audioUrl, wordTokens } = (await request.json()) as { audioUrl: string; wordTokens: Token[] };

    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) throw new Error(`Не удалось скачать аудио (${audioRes.status})`);
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

    const languageConfig = getLanguageConfig('fr');
    const result = await transcribeAndAlign(audioBuffer, wordTokens, languageConfig, apiKey);
    return Response.json(result);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}
