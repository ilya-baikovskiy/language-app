import type { LanguageConfig } from './languageConfig.js';

export type PracticePhraseRequest = {
  surfaceForm: string;
  translation: string;
  contextSource: string;
  contextTranslation?: string;
  level: string;
};

export type GeneratedPracticePhrase = {
  source: string;
  translation: string;
};

const PRACTICE_PHRASE_SCHEMA = {
  type: 'object',
  properties: {
    source: { type: 'string' },
    translation: { type: 'string' },
  },
  required: ['source', 'translation'],
  additionalProperties: false,
};

function isWordCharacter(char: string | undefined): boolean {
  return !!char && /[\p{L}\p{M}\p{N}]/u.test(char);
}

export function containsAlignedSurfaceForm(source: string, surfaceForm: string): boolean {
  let from = 0;
  while (from <= source.length - surfaceForm.length) {
    const index = source.indexOf(surfaceForm, from);
    if (index === -1) return false;
    const before = index > 0 ? source[index - 1] : undefined;
    const after = index + surfaceForm.length < source.length ? source[index + surfaceForm.length] : undefined;
    if (!isWordCharacter(before) && !isWordCharacter(after)) return true;
    from = index + 1;
  }
  return false;
}

export async function generatePracticePhrase(
  request: PracticePhraseRequest,
  languageConfig: LanguageConfig,
  apiKey: string,
  model: string,
): Promise<GeneratedPracticePhrase> {
  const systemPrompt = `You create ONE short cloze-practice sentence for an adult language learner.
The sentence is in ${languageConfig.promptLanguageName}; its translation is in Russian.

Hard rules:
- Preserve the exact target surface form character-for-character. Do not lemmatize, conjugate,
  decline, normalize spelling, or change capitalization inside the target.
- Use the target exactly once in a complete, natural sentence.
- Keep the SAME contextual sense as the original and its Russian gloss.
- Prefer 5-12 words. You may simplify surrounding vocabulary to make the sentence short and natural.
- Do not copy a broken fragment. Do not add explanations, blanks, underscores, brackets, or alternatives.
- The Russian translation must translate the whole generated sentence and make the target meaning clear.
- Output only the JSON object required by the schema.`;

  const userPrompt = `Learner level: ${request.level}
Exact target surface form: "${request.surfaceForm}"
Target contextual gloss in Russian: "${request.translation}"
Original sentence: "${request.contextSource}"
Original Russian translation: "${request.contextTranslation ?? '(not available)'}"`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'practice_phrase', strict: true, schema: PRACTICE_PHRASE_SCHEMA },
      },
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);

  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  const phrase = JSON.parse(json.choices[0].message.content) as GeneratedPracticePhrase;
  if (!containsAlignedSurfaceForm(phrase.source, request.surfaceForm)) {
    throw new Error('Generated practice phrase does not preserve the exact surface form');
  }
  if (!phrase.translation.trim()) throw new Error('Generated practice phrase has no translation');
  return phrase;
}

