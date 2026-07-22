// Шаг 6a пайплайна как HTTP-эндпоинт. Для elevenlabs — это ОДИН вызов,
// который делает TTS + выравнивание + quality gate целиком (with-timestamps),
// поэтому api/align-audio.ts для этого провайдера не используется вовсе. Для
// openai — только TTS; Whisper-выравнивание идёт отдельным вызовом
// (api/align-audio.ts) — serverless-таймаут (60с) не гарантированно тянет
// оба тяжёлых шага подряд для урока в 200–250 слов.

import { put } from '@vercel/blob';
import { generateSpeech } from '../lib/pipeline/generateAudio.js';
import { generateAndAlignElevenLabs, evaluateQualityGate } from '../lib/pipeline/audioProviders.js';
import { getLanguageConfig, type LanguageCode } from '../lib/pipeline/languageConfig.js';
import type { TokenSpan } from '../src/lib/lessonText.js';
import type { AudioProvider, Token } from '../src/types/lesson.js';

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  try {
    const {
      text,
      slug,
      provider = 'openai',
      language = 'fr',
      spans,
      wordTokens,
    } = (await request.json()) as {
      text: string;
      slug: string;
      provider?: AudioProvider;
      language?: LanguageCode;
      spans?: TokenSpan[];
      wordTokens?: Token[];
    };

    const languageConfig = getLanguageConfig(language);

    if (provider === 'elevenlabs') {
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) return new Response('Server misconfigured: ELEVENLABS_API_KEY missing', { status: 500 });
      if (!spans || !wordTokens) {
        return new Response('Для provider=elevenlabs нужны поля spans и wordTokens', { status: 400 });
      }

      const { audioBuffer, timestampsByToken, report } = await generateAndAlignElevenLabs(text, spans, wordTokens, languageConfig, apiKey);
      const gate = evaluateQualityGate(report);
      if (!gate.passed) {
        // Не сохраняем плохо выровненный урок молча — отчёт всё равно
        // возвращаем, чтобы было видно, что именно не так.
        return Response.json({ error: gate.reason, report }, { status: 422 });
      }

      const blob = await put(`audio/${slug}.mp3`, audioBuffer, {
        access: 'public',
        contentType: 'audio/mpeg',
        addRandomSuffix: false,
        allowOverwrite: true,
      });

      return Response.json({ audioUrl: blob.url, timestampsByToken, report });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return new Response('Server misconfigured: OPENAI_API_KEY missing', { status: 500 });
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
