// Режим перевода предложений как HTTP-эндпоинт. Один вызов = перевод ОДНОГО
// предложения — клиент вызывает это лениво по предложениям урока, когда включён
// тумблер «Перевод» (см. useSentenceTranslations.ts).

import { translateSentence } from '../lib/pipeline/translateSentence.js';
import { getLanguageConfig } from '../lib/pipeline/languageConfig.js';

export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response('Server misconfigured: OPENAI_API_KEY missing', { status: 500 });

  try {
    const { sentenceText, level, sourceLanguage } = (await request.json()) as {
      sentenceText: string;
      level?: string;
      sourceLanguage?: string;
    };
    const languageConfig = getLanguageConfig('fr');
    const model = process.env.OPENAI_TEXT_MODEL || 'gpt-4o';
    const translation = await translateSentence(
      sentenceText,
      languageConfig,
      level ?? 'A2',
      sourceLanguage ?? 'Russian',
      apiKey,
      model,
    );
    return Response.json({ translation });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}
