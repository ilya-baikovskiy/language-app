// Шаг 4 пайплайна как HTTP-эндпоинт. Один вызов = разметка фраз в ОДНОМ
// предложении — клиент вызывает это в цикле по всем предложениям урока.

import { markPhrasesForSentence } from '../lib/pipeline/markPhrases.ts';
import { getLanguageConfig } from '../lib/pipeline/languageConfig.ts';
import type { Sentence } from '../src/types/lesson.ts';

export const maxDuration = 30;

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response('Server misconfigured: OPENAI_API_KEY missing', { status: 500 });

  try {
    const { sentence } = (await request.json()) as { sentence: Sentence };
    const languageConfig = getLanguageConfig('fr');
    const model = process.env.OPENAI_TEXT_MODEL || 'gpt-4o';
    const groups = await markPhrasesForSentence(sentence, languageConfig, apiKey, model);
    return Response.json({ groups });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}
