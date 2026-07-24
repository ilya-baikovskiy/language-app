// Pipeline A как HTTP-эндпоинт — см. lib/pipeline/generateCards.ts. Один
// вызов генерирует пачку карточек-идей (по умолчанию ~20, см.
// PROGRESS.md/07 §2) для переданных enabled-тем/стран. Это ДЕШЁВЫЙ шаг
// (одна короткая генерация метаданных), не полноценный Lesson — тот
// генерируется отдельно, по клику пользователя, см. cardGeneration.ts.

import { generateCardCandidates, type CardGenerationRequest } from '../lib/pipeline/generateCards.js';
import { COUNTRIES, TOPICS } from '../src/content-system/catalog.js';

export const maxDuration = 60;

const TOPIC_LABELS = Object.fromEntries(TOPICS.map((t) => [t.id, t.labelRu]));
const COUNTRY_LABELS = Object.fromEntries(COUNTRIES.map((c) => [c.id, c.labelRu]));

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response('Server misconfigured: OPENAI_API_KEY missing', { status: 500 });

  try {
    const body = (await request.json()) as CardGenerationRequest;
    if (!body.enabledTopicIds?.length || !body.enabledCountryOrRegionIds?.length) {
      return new Response('enabledTopicIds and enabledCountryOrRegionIds are required', { status: 400 });
    }
    const request_: CardGenerationRequest = {
      desiredCount: Math.min(Math.max(body.desiredCount || 20, 1), 30),
      enabledTopicIds: body.enabledTopicIds,
      enabledCountryOrRegionIds: body.enabledCountryOrRegionIds,
      existingSubjectKeys: body.existingSubjectKeys ?? [],
    };
    const model = process.env.OPENAI_TEXT_MODEL || 'gpt-4o';
    const candidates = await generateCardCandidates(request_, TOPIC_LABELS, COUNTRY_LABELS, apiKey, model);
    return Response.json({ candidates });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}
