// Шаг 2 пайплайна — AI пишет/адаптирует текст урока. Ещё не токенизирован —
// это отдельный (не-AI) шаг 3, tokenize.ts.

import type { LanguageConfig } from './languageConfig.js';

export type InputSource =
  | { kind: 'text'; content: string }
  | { kind: 'topic'; prompt: string }
  | { kind: 'url'; url: string }; // объявлено для схемы на будущее, не реализовано в v1

export type GeneratedText = {
  title: string;
  translatedTitle: string;
  paragraphs: string[];
  estimatedMinutes: number;
};

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    translatedTitle: { type: 'string' },
    paragraphs: { type: 'array', items: { type: 'string' } },
    estimatedMinutes: { type: 'number' },
  },
  required: ['title', 'translatedTitle', 'paragraphs', 'estimatedMinutes'],
  additionalProperties: false,
};

function buildUserPrompt(
  input: InputSource,
  level: string,
  targetWords: number,
  languageConfig: LanguageConfig,
  sourceLanguage: string,
): string {
  const common = `Level: ${level} (CEFR)
Target length: roughly ${targetWords} words
Language to write in: ${languageConfig.promptLanguageName}
Translate the title into: ${sourceLanguage}`;

  if (input.kind === 'text') {
    return `Adapt the following source material into a short reading passage.\n\n${common}\n\nSource material:\n"""\n${input.content}\n"""`;
  }
  if (input.kind === 'topic') {
    return `Write an original short story or article about the following topic.\n\n${common}\n\nTopic: ${input.prompt}`;
  }
  throw new Error(`InputSource.kind "${input.kind}" не реализован в v1 пайплайна`);
}

const SYSTEM_PROMPT = `You write short graded-reader passages for language learners — the kind of
text used in an interactive reading app (think: a small story or article a learner reads while
tapping unfamiliar words for explanations).

Rules:
- Match the requested CEFR level: vocabulary, sentence length and grammar complexity should be
  appropriate, not harder or easier.
- Write natural, idiomatic prose — not a list of grammar-textbook example sentences. A small
  narrative arc (beginning, development, small resolution) reads better than disconnected facts.
- Split into paragraphs (2-5 sentences each) the way a real short story would be paragraphed.
- The title should be short and evocative, in the target language. translatedTitle is a natural
  translation into the source language, not a literal word-for-word gloss.
- estimatedMinutes is a rough reading+study time estimate for a learner at this level (not just
  audio playback duration) — for ~150-250 words this is usually 3-5 minutes.
- Output strictly the JSON object per the schema — no prose outside it.`;

export async function generateText(
  input: InputSource,
  options: { level: string; targetWords: number; sourceLanguage: string },
  languageConfig: LanguageConfig,
  apiKey: string,
  model: string,
): Promise<GeneratedText> {
  const userPrompt = buildUserPrompt(input, options.level, options.targetWords, languageConfig, options.sourceLanguage);

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'generated_text', strict: true, schema: RESPONSE_SCHEMA },
      },
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  return JSON.parse(json.choices[0].message.content) as GeneratedText;
}
