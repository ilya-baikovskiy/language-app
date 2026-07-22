// Шаг 5 пайплайна как HTTP-эндпоинт. Один вызов = объяснение для ОДНОГО
// слова/фразы — клиент вызывает это в цикле (с ограниченным параллелизмом)
// по всем единицам урока, обновляя пошаговый прогресс.

import {
  generateAnnotationBasic,
  generateAnnotationDetails,
  type AnnotationTarget,
} from '../lib/pipeline/generateAnnotations.js';
import { getLanguageConfig, type LanguageCode } from '../lib/pipeline/languageConfig.js';

export const maxDuration = 30;

// Один эндпоинт, два тира: tier='basic' (по клику по слову) отдаёт лёгкое
// базовое объяснение, tier='details' (по «Подробнее») — грамматику и формы.
// Клиент вызывает дважды (см. useSelectedAnnotation.ts).
export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response('Server misconfigured: OPENAI_API_KEY missing', { status: 500 });

  try {
    const { target, level, sourceLanguage, tier, language } = (await request.json()) as {
      target: AnnotationTarget;
      level: string;
      sourceLanguage?: string;
      tier?: 'basic' | 'details';
      language?: LanguageCode;
    };
    const languageConfig = getLanguageConfig(language ?? 'fr');
    const model = process.env.OPENAI_TEXT_MODEL || 'gpt-4o';
    const generate = tier === 'details' ? generateAnnotationDetails : generateAnnotationBasic;
    const content = await generate(target, languageConfig, level, sourceLanguage ?? 'Russian', apiKey, model);
    return Response.json(content);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}
