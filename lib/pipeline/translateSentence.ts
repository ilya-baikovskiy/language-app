// Перевод одного предложения на язык учащегося — для режима перевода в ридере
// (тумблер «Перевод предложений»). По образцу generateAnnotations.ts: строгий
// json_schema-ответ, ретраи на 429. Один вызов = одно предложение; клиент в
// режиме перевода дёргает это лениво по видимым предложениям.

import type { LanguageConfig } from './languageConfig.js';

const TRANSLATION_SCHEMA = {
  type: 'object',
  properties: { translation: { type: 'string' } },
  required: ['translation'],
  additionalProperties: false,
};

function systemPrompt(languageName: string, sourceLanguage: string): string {
  return `You are a ${languageName}-language teaching assistant embedded in a reading app.
Translate the given ${languageName} sentence into ${sourceLanguage} for a learner.

Rules:
- Produce ONE natural, faithful ${sourceLanguage} translation of the whole sentence — the meaning a
  fluent reader would get, not a word-by-word gloss.
- Keep the register and tone of the original. Do not add explanations, notes, or alternatives.
- Output strictly the JSON object per the schema.`;
}

export async function translateSentence(
  sentenceText: string,
  languageConfig: LanguageConfig,
  level: string,
  sourceLanguage: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const userPrompt = `Language: ${languageConfig.promptLanguageName}
Learner level: ${level}
Sentence: "${sentenceText}"`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt(languageConfig.promptLanguageName, sourceLanguage) },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'sentence_translation', strict: true, schema: TRANSLATION_SCHEMA } },
        temperature: 0.3,
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as { choices: { message: { content: string } }[] };
      const parsed = JSON.parse(json.choices[0].message.content) as { translation: string };
      return parsed.translation;
    }
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      continue;
    }
    throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  }
  throw new Error('unreachable');
}
