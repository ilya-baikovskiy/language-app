// Тонкий клиент ElevenLabs Forced Alignment + локальный кэш сырого ответа.
// Не часть приложения — секрет читается только здесь, в Node, из process.env
// (см. .env.example). Ни при каких обстоятельствах значение ключа не
// выводится в консоль/отчёт и не пишется в файл, кроме .env самим пользователем.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ENDPOINT = 'https://api.elevenlabs.io/v1/forced-alignment';
const REQUEST_TIMEOUT_MS = 60_000;

export type ElevenLabsCharacter = { text: string; start: number; end: number };
export type ElevenLabsWord = { text: string; start: number; end: number; loss: number };
export type ForcedAlignmentResponse = {
  characters: ElevenLabsCharacter[];
  words: ElevenLabsWord[];
  loss: number;
};

export const CACHE_PATH = path.resolve(import.meta.dirname, '../.cache/forced-alignment-raw.json');

export function missingKeyInstruction(): string {
  return (
    'ELEVENLABS_API_KEY не задан. Зайди на https://elevenlabs.io/app/settings/api-keys, ' +
    'создай API-ключ, затем впиши его в файл .env в корне проекта (скопируй из .env.example, ' +
    'если .env ещё нет) в строку ELEVENLABS_API_KEY=<твой ключ>.'
  );
}

async function readCache(): Promise<ForcedAlignmentResponse | null> {
  if (!existsSync(CACHE_PATH)) return null;
  try {
    const raw = await readFile(CACHE_PATH, 'utf-8');
    return JSON.parse(raw) as ForcedAlignmentResponse;
  } catch {
    return null;
  }
}

async function writeCache(data: ForcedAlignmentResponse): Promise<void> {
  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function describeHttpError(status: number, bodyText: string): string {
  const trimmedBody = bodyText.length > 300 ? `${bodyText.slice(0, 300)}…` : bodyText;
  switch (status) {
    case 401:
      return `ElevenLabs: 401 Unauthorized — ключ недействителен или отозван. Ответ сервера: ${trimmedBody}`;
    case 402:
      return `ElevenLabs: 402 Payment Required — на балансе недостаточно кредитов. Ответ сервера: ${trimmedBody}`;
    case 403:
      return `ElevenLabs: 403 Forbidden — доступ к forced-alignment закрыт для этого плана/ключа. Ответ сервера: ${trimmedBody}`;
    case 422:
      return `ElevenLabs: 422 Unprocessable Entity — сервер не принял файл/текст (проверь формат). Ответ сервера: ${trimmedBody}`;
    case 429:
      return `ElevenLabs: 429 Too Many Requests — превышен лимit запросов, попробуй позже. Ответ сервера: ${trimmedBody}`;
    default:
      if (status >= 500) return `ElevenLabs: ${status} — временная ошибка на стороне сервера. Ответ сервера: ${trimmedBody}`;
      return `ElevenLabs: неожиданный статус ${status}. Ответ сервера: ${trimmedBody}`;
  }
}

// Ровно один платный запрос, если нет кэша (или передан force=true). Кэш
// пишется сразу после успешного получения ответа — до любой дальнейшей
// обработки, чтобы повторный прогон никогда не платил снова.
export async function getForcedAlignment(
  audioBuffer: Buffer,
  text: string,
  options: { force?: boolean } = {},
): Promise<{ data: ForcedAlignmentResponse; fromCache: boolean }> {
  if (!options.force) {
    const cached = await readCache();
    if (cached) return { data: cached, fromCache: true };
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(missingKeyInstruction());
  }

  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'lesson.mp3');
  form.append('text', text);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: form,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`ElevenLabs: запрос не ответил за ${REQUEST_TIMEOUT_MS / 1000}с (timeout).`);
    }
    throw new Error(`ElevenLabs: сетевая ошибка — ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(describeHttpError(res.status, bodyText));
  }

  const data = (await res.json()) as ForcedAlignmentResponse;
  await writeCache(data);
  return { data, fromCache: false };
}
