// Кэширующая обёртка над Forced Alignment для eval-стенда. Сам HTTP-вызов и
// разбор ошибок живут в lib/pipeline/elevenLabsAudio.ts — там же, откуда ими
// пользуется приложение, чтобы эксперимент и прод не разъезжались. Здесь
// остаётся только то, что нужно именно эксперименту: один платный запрос за
// прогон и кэш сырого ответа на диске.
//
// Секрет читается только в Node, из process.env (см. .env.example). Ни при
// каких обстоятельствах значение ключа не выводится в консоль/отчёт и не
// пишется в файл, кроме .env самим пользователем.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  getForcedAlignment as requestForcedAlignment,
  missingKeyInstruction,
  type ForcedAlignmentResponse,
} from '../../../lib/pipeline/elevenLabsAudio.js';

export type { ElevenLabsCharacter, ElevenLabsWord, ForcedAlignmentResponse } from '../../../lib/pipeline/elevenLabsAudio.js';
export { missingKeyInstruction };

export const CACHE_PATH = path.resolve(import.meta.dirname, '../.cache/forced-alignment-raw.json');

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
  if (!apiKey) throw new Error(missingKeyInstruction());

  const data = await requestForcedAlignment(audioBuffer, text, apiKey);
  await writeCache(data);
  return { data, fromCache: false };
}
