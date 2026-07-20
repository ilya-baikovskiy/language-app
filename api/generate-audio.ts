// Шаг 6a пайплайна как HTTP-эндпоинт — только TTS, без Whisper (см.
// api/align-audio.ts) — так каждый вызов короче и безопаснее по таймауту
// (Vercel Hobby: до 60 сек). Загружает результат сразу в Vercel Blob и
// возвращает публичный URL — клиенту не нужно самому грузить аудио.

import { put } from '@vercel/blob';
import { generateSpeech } from '../lib/pipeline/generateAudio.ts';
import { getLanguageConfig } from '../lib/pipeline/languageConfig.ts';

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response('Server misconfigured: OPENAI_API_KEY missing', { status: 500 });

  try {
    const { text, slug } = (await request.json()) as { text: string; slug: string };
    const languageConfig = getLanguageConfig('fr');
    const audioBuffer = await generateSpeech(text, languageConfig, apiKey);

    const blob = await put(`audio/${slug}.mp3`, audioBuffer, {
      access: 'public',
      contentType: 'audio/mpeg',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return Response.json({ audioUrl: blob.url });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}
