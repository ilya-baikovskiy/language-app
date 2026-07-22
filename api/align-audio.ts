// Шаг 6b пайплайна — Whisper-выравнивание, отдельно от TTS
// (api/generate-audio.ts). Только для provider=openai — ElevenLabs делает всё
// одним вызовом в api/generate-audio.ts (with-timestamps) и сюда не заходит.
//
// SSRF-минимизация: audioUrl обязан указывать на Vercel Blob storage (наш
// собственный, куда мы сами загрузили аудио шагом раньше), а не на
// произвольный хост — иначе этот эндпоинт можно использовать как открытый
// HTTP-прокси (fetch(audioUrl) от чужого запроса). Это не полноценная
// авторизация эндпоинта (см. security-заметки в PROGRESS.md — она отдельной
// задачей), но закрывает конкретно перенаправление на произвольный хост.

import { transcribeAndAlign } from '../lib/pipeline/generateAudio.js';
import { finalizeAlignment, evaluateQualityGate } from '../lib/pipeline/audioProviders.js';
import { getLanguageConfig, type LanguageCode } from '../lib/pipeline/languageConfig.js';
import type { Token } from '../src/types/lesson.js';

export const maxDuration = 60;

function isAllowedAudioUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.public.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { audioUrl, wordTokens, language = 'fr' } = (await request.json()) as {
      audioUrl: string;
      wordTokens: Token[];
      language?: LanguageCode;
    };

    if (!isAllowedAudioUrl(audioUrl)) {
      return new Response('audioUrl должен указывать на Vercel Blob storage', { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return new Response('Server misconfigured: OPENAI_API_KEY missing', { status: 500 });

    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) throw new Error(`Не удалось скачать аудио (${audioRes.status})`);
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

    const languageConfig = getLanguageConfig(language);
    const { timestampsByToken, recoveryLog } = await transcribeAndAlign(audioBuffer, wordTokens, languageConfig, apiKey);
    const aligned = finalizeAlignment('openai', wordTokens, timestampsByToken, recoveryLog, languageConfig);

    const gate = evaluateQualityGate(aligned.report);
    if (!gate.passed) {
      return Response.json({ error: gate.reason, report: aligned.report }, { status: 422 });
    }

    return Response.json(aligned);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}
