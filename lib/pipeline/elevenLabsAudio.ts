// ElevenLabs-провайдер шага 6 пайплайна: озвучка + word-level таймкоды,
// параллельно OpenAI-пути (TTS → Whisper) в generateAudio.ts. Оба провайдера
// отдают одинаковую форму результата через lib/pipeline/audioProviders.ts —
// вызывающий код выбирает провайдера одним параметром.
//
// Используется `/v1/text-to-speech/{voice}/with-timestamps` — ОДИН вызов,
// который отдаёт аудио и посимвольные тайминги сразу, как часть самого
// синтеза (см. https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps).
// Это принципиально отличается и от Whisper-пути (Whisper *распознаёт* готовое
// аудио и потом угадывает соответствие словам), и от более раннего варианта
// этого файла — отдельного `/v1/forced-alignment` по уже готовому аудио
// (два вызова, лишний round-trip перезагрузки аудио). with-timestamps ближе к
// тому, как это делает Amazon Polly (speech marks) — тайминг не пост-анализ,
// а побочный продукт генерации.
//
// В ответе два массива символов: `alignment` (по ИСХОДНОМУ тексту, как
// отправлен) и `normalized_alignment` (после нормализации — например, цифры
// прописью). Используем строго `alignment`: наши spans из buildLessonText
// построены на сыром тексте, normalized_alignment их бы рассинхронизировал.

import type { Token } from '../../src/types/lesson.js';
import type { TokenSpan } from '../../src/lib/lessonText.js';
import type { LanguageConfig } from './languageConfig.js';
import { mapCharactersToTokens } from './mapCharactersToTokens.js';
import type { RecoveryEntry, TimedRange } from './timingRecovery.js';

const TTS_ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-speech';
const ALIGNMENT_ENDPOINT = 'https://api.elevenlabs.io/v1/forced-alignment';
const REQUEST_TIMEOUT_MS = 60_000;

export type ElevenLabsCharacter = { text: string; start: number; end: number };
export type ElevenLabsWord = { text: string; start: number; end: number; loss: number };
export type ForcedAlignmentResponse = { characters: ElevenLabsCharacter[]; words: ElevenLabsWord[]; loss: number };

type WithTimestampsResponse = {
  audio_base64: string;
  alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
  normalized_alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
};

export function missingKeyInstruction(): string {
  return (
    'ELEVENLABS_API_KEY не задан. Зайди на https://elevenlabs.io/app/settings/api-keys, ' +
    'создай API-ключ, затем впиши его в файл .env в корне проекта (скопируй из .env.example, ' +
    'если .env ещё нет) в строку ELEVENLABS_API_KEY=<твой ключ>.'
  );
}

// Отдельные сообщения на каждый статус: 402/403 означают «план или кредиты», а
// не ошибку в коде, и без расшифровки в этом легко потерять полчаса.
export function describeHttpError(status: number, bodyText: string): string {
  const trimmedBody = bodyText.length > 300 ? `${bodyText.slice(0, 300)}…` : bodyText;
  switch (status) {
    case 401:
      return `ElevenLabs: 401 Unauthorized — ключ недействителен или отозван. Ответ сервера: ${trimmedBody}`;
    case 402:
      return `ElevenLabs: 402 Payment Required — на балансе недостаточно кредитов. Ответ сервера: ${trimmedBody}`;
    case 403:
      return `ElevenLabs: 403 Forbidden — доступ закрыт для этого плана/ключа. Ответ сервера: ${trimmedBody}`;
    case 422:
      return `ElevenLabs: 422 Unprocessable Entity — сервер не принял файл/текст (проверь формат). Ответ сервера: ${trimmedBody}`;
    case 429:
      return `ElevenLabs: 429 Too Many Requests — превышен лимит запросов, попробуй позже. Ответ сервера: ${trimmedBody}`;
    default:
      if (status >= 500) return `ElevenLabs: ${status} — временная ошибка на стороне сервера. Ответ сервера: ${trimmedBody}`;
      return `ElevenLabs: неожиданный статус ${status}. Ответ сервера: ${trimmedBody}`;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`ElevenLabs: запрос не ответил за ${REQUEST_TIMEOUT_MS / 1000}с (timeout).`);
    }
    throw new Error(`ElevenLabs: сетевая ошибка — ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

// Голос берётся из LanguageConfig (единственная точка знания про язык), но
// перекрывается ELEVENLABS_VOICE_ID — так голос можно менять без деплоя, пока
// идёт подбор на слух.
function resolveVoiceId(languageConfig: LanguageConfig): string {
  return process.env.ELEVENLABS_VOICE_ID || languageConfig.voices.elevenLabsVoiceId;
}

function alignmentToCharacters(alignment: WithTimestampsResponse['alignment']): ElevenLabsCharacter[] {
  return alignment.characters.map((text, i) => ({
    text,
    start: alignment.character_start_times_seconds[i],
    end: alignment.character_end_times_seconds[i],
  }));
}

// Короткий клип для отдельного слова/фразы (Bottom Sheet) — та же функция TTS
// с тем же голосом/темпом, что и весь урок, БЕЗ таймингов (они тут не нужны,
// проигрывается целиком). Используется api/speak-unit.ts.
export async function generateSpeechElevenLabs(text: string, languageConfig: LanguageConfig, apiKey: string): Promise<Buffer> {
  const res = await fetchWithTimeout(`${TTS_ENDPOINT}/${resolveVoiceId(languageConfig)}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: languageConfig.voices.elevenLabsModelId,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: languageConfig.voices.elevenLabsSpeed },
    }),
  });
  if (!res.ok) throw new Error(describeHttpError(res.status, await res.text().catch(() => '')));
  return Buffer.from(await res.arrayBuffer());
}

// Урок целиком: один вызов даёт и аудио, и посимвольные тайминги. Дальше —
// mapCharactersToTokens (позиционное сопоставление с нашими токенами) поверх
// РОВНО того текста, что был отправлен (см. TokenSpan из buildLessonText).
export async function generateLessonAudioElevenLabs(
  text: string,
  spans: TokenSpan[],
  wordTokens: Token[],
  languageConfig: LanguageConfig,
  apiKey: string,
): Promise<{ audioBuffer: Buffer; timestampsByToken: Record<string, TimedRange>; recoveryLog: RecoveryEntry[] }> {
  const res = await fetchWithTimeout(`${TTS_ENDPOINT}/${resolveVoiceId(languageConfig)}/with-timestamps`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: languageConfig.voices.elevenLabsModelId,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: languageConfig.voices.elevenLabsSpeed },
    }),
  });
  if (!res.ok) throw new Error(describeHttpError(res.status, await res.text().catch(() => '')));
  const data = (await res.json()) as WithTimestampsResponse;

  const audioBuffer = Buffer.from(data.audio_base64, 'base64');
  const characters = alignmentToCharacters(data.alignment);

  const tokensById = new Map(wordTokens.map((token) => [token.id, token]));
  const { mapped, edgeSnapped, responseTextMatches } = mapCharactersToTokens(characters, text, spans, tokensById);

  if (!responseTextMatches) {
    throw new Error(
      'ElevenLabs вернул текст, не совпадающий с отправленным — сопоставить тайминги с токенами нельзя. ' +
        'Проверь, что в TTS ушёл ровно тот текст, для которого построены spans.',
    );
  }

  const timestampsByToken: Record<string, TimedRange> = {};
  for (const token of mapped) {
    timestampsByToken[token.tokenId] = { startTime: token.startTime, endTime: token.endTime };
  }
  // unmapped (все символы токена невалидны) намеренно не создаёт запись в
  // timestampsByToken — это работа timingRecovery.recoverTimings выше по
  // стеку (interpolateMissing), не этого модуля.

  return { audioBuffer, timestampsByToken, recoveryLog: edgeSnapped };
}

// Отдельный forced-alignment по уже готовому аудио — НЕ используется
// продовым пайплайном (см. generateLessonAudioElevenLabs выше, один вызов
// with-timestamps). Оставлен для evals/audio-alignment: там сознательно
// нужно выровнять ОДНО И ТО ЖЕ аудио (сгенерированное OpenAI) двумя
// способами — Whisper и ElevenLabs FA — чтобы сравнить именно выравнивание,
// а не голос+выравнивание вместе.
export async function getForcedAlignment(audioBuffer: Buffer, text: string, apiKey: string): Promise<ForcedAlignmentResponse> {
  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'lesson.mp3');
  form.append('text', text);

  const res = await fetchWithTimeout(ALIGNMENT_ENDPOINT, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
  });
  if (!res.ok) throw new Error(describeHttpError(res.status, await res.text().catch(() => '')));
  return (await res.json()) as ForcedAlignmentResponse;
}
