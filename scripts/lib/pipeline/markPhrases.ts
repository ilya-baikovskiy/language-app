// Шаг 4 пайплайна (новый) — находит, какие соседние токены образуют одну
// конструкцию, достойную объяснения как единое целое (раздел 9-10 ТЗ,
// см. AI_PIPELINE.md). Отдаёт только границы (id токенов), без контента —
// контент генерирует шаг 5 (generateAnnotations.ts) уже поверх этих групп.

import type { LanguageConfig } from './languageConfig.ts';
import type { Paragraph, Sentence } from '../../../src/types/lesson.ts';

export type PhraseGroup = { tokenIds: string[] };

const SYSTEM_PROMPT = (languageName: string) => `You are analyzing a ${languageName} sentence to
find word groups that should be explained together as a single unit for a language learner,
rather than word-by-word.

Group tokens together ONLY when they form:
- a fixed/idiomatic expression (e.g. "avoir besoin de", "le cœur léger")
- a verb + its required preposition, when the preposition is an integral, non-obvious part of the
  meaning (e.g. "décider de", "commencer à")
- a reflexive/pronominal verb together with its auxiliary in a compound tense (e.g. "s'est assise",
  "se sont mises")
- a compound preposition (e.g. "près de", "le long de")

Do NOT group:
- a verb with its direct object — that is ordinary syntax, not a fixed unit
- an article with its noun
- anything whose meaning is already obvious word-by-word

Rules:
- A group must be made of CONSECUTIVE tokens, in the given order, by id.
- Only include tokens of type "word" — never punctuation.
- Groups must not overlap.
- Most sentences will have zero or very few groups — that is expected. Return an empty array if
  nothing in this sentence deserves grouping. Do not force a group to justify the call.
- Output strictly the JSON object per the schema — no prose outside it.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    groups: {
      type: 'array',
      items: {
        type: 'object',
        properties: { tokenIds: { type: 'array', items: { type: 'string' } } },
        required: ['tokenIds'],
        additionalProperties: false,
      },
    },
  },
  required: ['groups'],
  additionalProperties: false,
};

function isConsecutiveWordSpan(sentence: Sentence, tokenIds: string[]): boolean {
  if (tokenIds.length < 2) return false;
  const indices = tokenIds.map((id) => sentence.tokens.findIndex((t) => t.id === id));
  if (indices.some((i) => i === -1)) return false;
  if (indices.some((i) => sentence.tokens[i].type !== 'word')) return false;
  const sorted = [...indices].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) return false;
  }
  return true;
}

async function markPhrasesForSentence(
  sentence: Sentence,
  languageConfig: LanguageConfig,
  apiKey: string,
  model: string,
): Promise<PhraseGroup[]> {
  const wordTokens = sentence.tokens.filter((t) => t.type === 'word').map((t) => ({ id: t.id, text: t.text }));
  if (wordTokens.length < 2) return [];

  const userPrompt = `Sentence: "${sentence.text}"
Tokens (in order): ${JSON.stringify(wordTokens)}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT(languageConfig.promptLanguageName) },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'phrase_groups', strict: true, schema: RESPONSE_SCHEMA },
      },
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  const parsed = JSON.parse(json.choices[0].message.content) as { groups: PhraseGroup[] };

  const valid = parsed.groups.filter((g) => isConsecutiveWordSpan(sentence, g.tokenIds));
  const invalidCount = parsed.groups.length - valid.length;
  if (invalidCount > 0) {
    console.warn(`  ⚠ отброшено ${invalidCount} невалидных групп в предложении "${sentence.text}"`);
  }
  return valid;
}

export async function markPhrasesForLesson(
  paragraphs: Paragraph[],
  languageConfig: LanguageConfig,
  apiKey: string,
  model = process.env.OPENAI_TEXT_MODEL || 'gpt-4o',
): Promise<PhraseGroup[]> {
  const allGroups: PhraseGroup[] = [];
  // Последовательно, не параллельно — сентенс-за-сентенсом, чтобы не упереться
  // в тот же rate limit, что уже ловили на генерации аннотаций.
  for (const paragraph of paragraphs) {
    for (const sentence of paragraph.sentences) {
      const groups = await markPhrasesForSentence(sentence, languageConfig, apiKey, model);
      allGroups.push(...groups);
    }
  }
  return allGroups;
}
