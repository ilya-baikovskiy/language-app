// Шаг 5 пайплайна как HTTP-эндпоинт. Один вызов = объяснение для ОДНОГО
// слова/фразы — клиент вызывает это в цикле (с ограниченным параллелизмом)
// по всем единицам урока, обновляя пошаговый прогресс.

import { generateAnnotationContent, type AnnotationTarget } from '../lib/pipeline/generateAnnotations.js';
import { getLanguageConfig } from '../lib/pipeline/languageConfig.js';

export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response('Server misconfigured: OPENAI_API_KEY missing', { status: 500 });

  try {
    const { target, level, sourceLanguage } = (await request.json()) as {
      target: AnnotationTarget;
      level: string;
      sourceLanguage?: string;
    };
    const languageConfig = getLanguageConfig('fr');
    const model = process.env.OPENAI_TEXT_MODEL || 'gpt-4o';
    const content = await generateAnnotationContent(target, languageConfig, level, sourceLanguage ?? 'Russian', apiKey, model);
    return Response.json(content);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}
