// Шаг 2 пайплайна как HTTP-эндпоинт. Один вызов = один AI-запрос — короткий,
// безопасный по таймауту serverless-функции (см. AI_PIPELINE.md/план).

import { generateText, type InputSource } from '../lib/pipeline/generateText.js';
import { getLanguageConfig } from '../lib/pipeline/languageConfig.js';

export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response('Server misconfigured: OPENAI_API_KEY missing', { status: 500 });

  try {
    const body = (await request.json()) as {
      input: InputSource;
      level: string;
      words: number;
      sourceLanguage?: string;
    };
    const languageConfig = getLanguageConfig('fr');
    const model = process.env.OPENAI_TEXT_MODEL || 'gpt-4o';
    const result = await generateText(
      body.input,
      { level: body.level, targetWords: body.words, sourceLanguage: body.sourceLanguage ?? 'Russian' },
      languageConfig,
      apiKey,
      model,
    );
    return Response.json(result);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}
