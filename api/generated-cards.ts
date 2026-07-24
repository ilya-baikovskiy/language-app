// Pipeline A как HTTP-эндпоинт (см. 07_AI_CONTENT_GENERATION_PIPELINE.md §2)
// + хранилище пула AI-сгенерированных карточек — объединены в один файл (было
// два: generate-cards.ts + generated-cards.ts), потому что Vercel Hobby-план
// считает serverless-функции по файлам под api/ (лимит 12) и раздельные файлы
// вывели проект за лимит. GET — список пула (для BlobGeneratedCardRepository.
// listCandidates); POST — генерирует пачку кандидатов через OpenAI, валидирует
// их (та же функция, что и клиент использует для собственной проверки) и
// атомарно добавляет принятые карточки в пул одним read-modify-write.
//
// Пул глобальный, НЕ per-user: ContentCard — canonical cross-language идея,
// не принадлежит одному пользователю (см. 07 §1, 06).

import { put, list } from '@vercel/blob';
import { generateCardCandidates, type CardGenerationRequest } from '../lib/pipeline/generateCards.js';
import { candidatesToContentCards } from '../src/content-system/cardGenerationPipeline.js';
import { COUNTRIES, TOPICS } from '../src/content-system/catalog.js';
import type { CEFRLevel, ContentCard } from '../src/content-system/types.js';
import type { LanguageCode } from '../lib/pipeline/languageConfig.js';

export const maxDuration = 60;

const POOL_PATH = 'content-system/v1/generated-cards/pool.v1.json';
const TOPIC_LABELS = Object.fromEntries(TOPICS.map((t) => [t.id, t.labelRu]));
const COUNTRY_LABELS = Object.fromEntries(COUNTRIES.map((c) => [c.id, c.labelRu]));

async function readPool(): Promise<ContentCard[]> {
  const { blobs } = await list({ prefix: POOL_PATH, limit: 1 });
  if (blobs.length === 0) return [];
  const res = await fetch(blobs[0].url);
  if (!res.ok) return [];
  return res.json();
}

async function writePool(cards: ContentCard[]): Promise<void> {
  await put(POOL_PATH, JSON.stringify(cards), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function GET(): Promise<Response> {
  try {
    return Response.json(await readPool());
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response('Server misconfigured: OPENAI_API_KEY missing', { status: 500 });

  try {
    const body = (await request.json()) as CardGenerationRequest & { language: string; level: string };
    if (!body.enabledTopicIds?.length || !body.enabledCountryOrRegionIds?.length) {
      return new Response('enabledTopicIds and enabledCountryOrRegionIds are required', { status: 400 });
    }
    if (!body.language || !body.level) {
      return new Response('language and level are required', { status: 400 });
    }

    const pool = await readPool();
    const existingSubjectKeys = new Set(pool.map((c) => c.canonicalSubjectKey));

    const genRequest: CardGenerationRequest = {
      desiredCount: Math.min(Math.max(body.desiredCount || 20, 1), 30),
      enabledTopicIds: body.enabledTopicIds,
      enabledCountryOrRegionIds: body.enabledCountryOrRegionIds,
      existingSubjectKeys: Array.from(existingSubjectKeys),
    };
    const model = process.env.OPENAI_TEXT_MODEL || 'gpt-4o';
    const rawCandidates = await generateCardCandidates(genRequest, TOPIC_LABELS, COUNTRY_LABELS, apiKey, model);
    const accepted = candidatesToContentCards(
      rawCandidates,
      { language: body.language as LanguageCode, level: body.level as CEFRLevel },
      existingSubjectKeys,
    );

    if (accepted.length > 0) {
      await writePool([...pool, ...accepted]);
    }

    return Response.json({ added: accepted, totalPoolSize: pool.length + accepted.length });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}
