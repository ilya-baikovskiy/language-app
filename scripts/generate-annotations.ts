// Генерирует объяснения (Bottom Sheet контент) для слов урока, у которых нет
// аннотации, добавленной вручную — по шаблону из AI_PIPELINE.md (полное
// предложение как контекст, строгий JSON-schema-ответ).
//
// Результат: src/data/generatedAnnotations.json — { [tokenId]: AnnotationContent }.
// Подмешивается в sampleLesson.ts отдельным шагом, не трогая 26 аннотаций,
// написанных вручную.
//
// Не рантайм-код — вызывается один раз при подготовке урока, ключ читается
// только здесь.
//
// Запуск: npx tsx --env-file=.env scripts/generate-annotations.ts [--fresh] [--limit=N]

import { writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { sampleLesson } from '../src/data/sampleLesson.ts';
import type { Lesson, Token } from '../src/types/lesson.ts';

const OUT = new URL('../src/data/generatedAnnotations.json', import.meta.url);
const MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-4o';
const CONCURRENCY = 2;
const LEVEL = sampleLesson.level;

type AnnotationContent = {
  displayText: string;
  lemma: string;
  pronunciation: string | null;
  partOfSpeech: string | null;
  grammarLabel: string | null;
  shortTranslation: string;
  contextualMeaning: string;
  constructionExplanation: string | null;
  grammarSummary: string | null;
  grammarDetails: string | null;
  otherMeanings: { translation: string; note: string | null }[] | null;
  examples: { targetText: string; translation: string }[];
};

const SYSTEM_PROMPT = `You are a French-language teaching assistant embedded in a reading app.
A learner (Russian-speaking, CEFR level ${LEVEL}) clicked on a word while reading.
Explain it the way a good teacher would in a short, live aside — not a dictionary entry.

Rules:
- All explanatory text (contextualMeaning, grammarSummary, grammarDetails,
  constructionExplanation, otherMeanings[].note) must be written in Russian,
  natural and concise.
- shortTranslation is a short Russian gloss (a few words), not a full sentence.
- lemma, displayText, pronunciation, partOfSpeech, grammarLabel and
  examples[].targetText stay in French (examples[].translation is Russian).
- contextualMeaning must explain the MEANING IN THIS SPECIFIC SENTENCE first —
  never open with a generic dictionary definition.
- grammarSummary: 1-2 sentences, plain language, no textbook jargon. For very
  simple function words (articles, basic pronouns, "et", "de" as a bare
  preposition) it is fine to keep this short or return null — do not pad.
- grammarDetails (only if there's a genuinely useful deeper point — tense
  contrast, an irregular form, a common learner mistake): 2-4 sentences max,
  otherwise null.
- constructionExplanation: only if the word is genuinely part of a fixed
  pattern worth naming, otherwise null.
- otherMeanings: only if there's a real secondary sense worth knowing,
  otherwise null.
- Provide exactly 2 examples: short, natural French sentences roughly at the
  learner's level, using the same word, each with a Russian translation.
- Never invent grammar that isn't true. If unsure, return null for that field
  rather than guess.
- Output strictly the JSON object per the provided schema.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    displayText: { type: 'string' },
    lemma: { type: 'string' },
    pronunciation: { type: ['string', 'null'] },
    partOfSpeech: { type: ['string', 'null'] },
    grammarLabel: { type: ['string', 'null'] },
    shortTranslation: { type: 'string' },
    contextualMeaning: { type: 'string' },
    constructionExplanation: { type: ['string', 'null'] },
    grammarSummary: { type: ['string', 'null'] },
    grammarDetails: { type: ['string', 'null'] },
    otherMeanings: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        properties: { translation: { type: 'string' }, note: { type: ['string', 'null'] } },
        required: ['translation', 'note'],
        additionalProperties: false,
      },
    },
    examples: {
      type: 'array',
      items: {
        type: 'object',
        properties: { targetText: { type: 'string' }, translation: { type: 'string' } },
        required: ['targetText', 'translation'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'displayText',
    'lemma',
    'pronunciation',
    'partOfSpeech',
    'grammarLabel',
    'shortTranslation',
    'contextualMeaning',
    'constructionExplanation',
    'grammarSummary',
    'grammarDetails',
    'otherMeanings',
    'examples',
  ],
  additionalProperties: false,
};

function collectUnannotatedWordTokens(lesson: Lesson): { token: Token; sentenceText: string }[] {
  const out: { token: Token; sentenceText: string }[] = [];
  for (const paragraph of lesson.paragraphs) {
    for (const sentence of paragraph.sentences) {
      for (const token of sentence.tokens) {
        if (token.type === 'word' && !token.annotationId) {
          out.push({ token, sentenceText: sentence.text });
        }
      }
    }
  }
  return out;
}

async function generateOne(token: Token, sentenceText: string, apiKey: string): Promise<AnnotationContent> {
  const userPrompt = `Language: French
Learner level: ${LEVEL}
Full sentence: "${sentenceText}"
Target span in the sentence: "${token.text}"
Token type: word`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'annotation', strict: true, schema: RESPONSE_SCHEMA },
        },
        temperature: 0.4,
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as { choices: { message: { content: string } }[] };
      return JSON.parse(json.choices[0].message.content) as AnnotationContent;
    }
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      continue;
    }
    throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  }
  throw new Error('unreachable');
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY не задан (запускай с --env-file=.env)');

  const forceFresh = process.argv.includes('--fresh');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

  let existing: Record<string, AnnotationContent> = {};
  if (!forceFresh && existsSync(OUT)) {
    existing = JSON.parse(await readFile(OUT, 'utf-8'));
  }

  const allTargets = collectUnannotatedWordTokens(sampleLesson);
  const targets = allTargets.filter(({ token }) => !existing[token.id]).slice(0, limit);

  console.log(`Слов без аннотации всего: ${allTargets.length}. Уже сгенерировано: ${Object.keys(existing).length}. Генерирую сейчас: ${targets.length}.`);

  if (targets.length === 0) {
    console.log('Нечего генерировать.');
    return;
  }

  let done = 0;
  let failed = 0;
  const results = await mapWithConcurrency(targets, CONCURRENCY, async ({ token, sentenceText }) => {
    try {
      const content = await generateOne(token, sentenceText, apiKey);
      done++;
      process.stdout.write(`\r${done + failed}/${targets.length} (ok: ${done}, fail: ${failed})`);
      return { tokenId: token.id, content };
    } catch (err) {
      failed++;
      process.stdout.write(`\r${done + failed}/${targets.length} (ok: ${done}, fail: ${failed})`);
      console.error(`\n✗ "${token.text}" (${token.id}):`, err instanceof Error ? err.message : err);
      return null;
    }
  });
  console.log();

  const merged = { ...existing };
  for (const r of results) {
    if (r) merged[r.tokenId] = r.content;
  }

  await writeFile(OUT, JSON.stringify(merged, null, 2));
  console.log(`✓ src/data/generatedAnnotations.json (${Object.keys(merged).length} записей, ${failed} не удалось)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
