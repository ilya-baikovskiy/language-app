// Клип отдельного слова/фразы для Bottom Sheet — не нарезка общей дорожки
// урока (там коартикуляция соседних слов режет звук на границах — см.
// découvrir-баг в PROGRESS.md), а отдельная короткая генерация, тем же
// голосом/провайдером, что и весь урок (иначе клик по слову внутри
// OpenAI-урока внезапно заговорит голосом ElevenLabs). Кэшируется в Blob по
// хэшу текста+голоса — повторные клики по одному и тому же слову бесплатны.

import { put, list } from '@vercel/blob';
import { createHash } from 'node:crypto';
import { generateSpeech } from '../lib/pipeline/generateAudio.js';
import { generateSpeechElevenLabs } from '../lib/pipeline/elevenLabsAudio.js';
import { getLanguageConfig, type LanguageCode } from '../lib/pipeline/languageConfig.js';
import type { AudioProvider } from '../src/types/lesson.js';

export const maxDuration = 30;

// Дешёвый предохранитель: это слово/короткая фраза, не абзац — длинный текст
// сюда прилетать не должен ни по UX, ни по стоимости кэш-промаха.
const MAX_TEXT_LENGTH = 80;

function clipPathname(provider: AudioProvider, language: LanguageCode, text: string): string {
  const hash = createHash('sha256').update(`${provider}|${language}|${text}`).digest('hex');
  return `clips/${provider}/${language}/${hash}.mp3`;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { text, language = 'fr', provider = 'openai' } = (await request.json()) as {
      text: string;
      language?: LanguageCode;
      provider?: AudioProvider;
    };

    if (!text || !text.trim()) return new Response('text обязателен', { status: 400 });
    if (text.length > MAX_TEXT_LENGTH) {
      return new Response(`text длиннее ${MAX_TEXT_LENGTH} символов — этот эндпоинт для слова/фразы, не для абзаца`, { status: 400 });
    }

    const languageConfig = getLanguageConfig(language);
    const pathname = clipPathname(provider, language, text);

    const existing = await list({ prefix: pathname, limit: 1 });
    if (existing.blobs.length > 0) {
      return Response.json({ audioUrl: existing.blobs[0].url });
    }

    let audioBuffer: Buffer;
    if (provider === 'elevenlabs') {
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) return new Response('Server misconfigured: ELEVENLABS_API_KEY missing', { status: 500 });
      audioBuffer = await generateSpeechElevenLabs(text, languageConfig, apiKey);
    } else {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return new Response('Server misconfigured: OPENAI_API_KEY missing', { status: 500 });
      audioBuffer = await generateSpeech(text, languageConfig, apiKey);
    }

    const blob = await put(pathname, audioBuffer, {
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
