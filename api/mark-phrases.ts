// Шаг 4 пайплайна как HTTP-эндпоинт. Один вызов = разметка фраз в ОДНОМ
// предложении — клиент вызывает это в цикле по всем предложениям урока.

import { markPhrasesForSentence } from '../lib/pipeline/markPhrases.js';
import { getLanguageConfig, type LanguageCode } from '../lib/pipeline/languageConfig.js';
import type { Sentence } from '../src/types/lesson.js';

export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response('Server misconfigured: OPENAI_API_KEY missing', { status: 500 });

  try {
    const { sentence, language } = (await request.json()) as { sentence: Sentence; language?: LanguageCode };
    const languageConfig = getLanguageConfig(language ?? 'fr');
    const model = process.env.OPENAI_TEXT_MODEL || 'gpt-4o';
    const groups = await markPhrasesForSentence(sentence, languageConfig, apiKey, model);
    return Response.json({ groups });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}
