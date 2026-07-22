// Шаг 4 пайплайна (новый) — находит, какие соседние токены образуют одну
// конструкцию, достойную объяснения как единое целое (раздел 9-10 ТЗ,
// см. AI_PIPELINE.md). Отдаёт только границы (id токенов), без контента —
// контент генерирует шаг 5 (generateAnnotations.ts) уже поверх этих групп.

import type { LanguageConfig, LanguageCode } from './languageConfig.js';
import type { Paragraph, Sentence } from '../../src/types/lesson.js';

export type PhraseGroup = { tokenIds: string[] };

// Примеры — язык-специфичные, не просто переведённые французские. Прежняя
// версия промпта показывала модели ТОЛЬКО французские примеры независимо от
// языка урока (даже когда языковое название в шапке подставлялось верно) —
// на греческом это давало сверхгруппировку: модель склеивала "Μετά το φαγητό"
// (предлог+артикль+существительное — обычная составная конструкция, прямо
// запрещённый случай "article+noun") и "πήγαν σε" (глагол+предлог, но предлог
// тут вполне прозрачный, не "неочевидная" часть смысла, как того требует
// правило) — то есть не следовала собственным критериям на языке, для
// которого не видела ни одного релевантного примера. Каждый язык теперь
// получает свой набор, отражающий его реальную грамматику (например, у
// немецкого это отделяемые приставки глаголов — прямой аналог "неочевидного
// предлога", у греческого — безличные конструкции вроде "μου αρέσει").
type PhraseExamples = {
  idiomatic: string;
  verbParticle: string;
  compoundTense: string;
  compoundPreposition: string;
  doNotGroupExample: string;
};

const EXAMPLES_BY_LANGUAGE: Record<LanguageCode, PhraseExamples> = {
  fr: {
    idiomatic: '"avoir besoin de" (need), "le cœur léger" (light-hearted)',
    verbParticle: '"décider de" (decide to), "commencer à" (start to)',
    compoundTense: '"s\'est assise", "se sont mises" (reflexive verb + auxiliary)',
    compoundPreposition: '"près de" (near), "le long de" (along)',
    doNotGroupExample: '"le chat" (article + noun — obvious, do not group)',
  },
  de: {
    idiomatic: '"es gibt" (there is/are, lit. "it gives"), "Lust haben" (feel like, lit. "have desire")',
    verbParticle:
      'separable verbs, where the prefix is split off and moved to the end of the clause — ' +
      '"aufstehen" appearing as "steht … auf" ("Sie steht früh auf" = she gets up early); ' +
      'also "warten auf" (wait for)',
    compoundTense: '"hat sich gesetzt" (sat down — reflexive verb + auxiliary)',
    compoundPreposition: '"in der Nähe von" (near)',
    doNotGroupExample: '"das Essen" (article + noun — obvious, do not group)',
  },
  en: {
    idiomatic: '"kick the bucket" (die)',
    verbParticle: 'phrasal verbs — "look forward to", "give up", "run into" (meet by chance)',
    compoundTense: '"has given up" (auxiliary + participle, incl. phrasal verb)',
    compoundPreposition: '"in front of", "because of"',
    doNotGroupExample: '"the food" (article + noun — obvious, do not group)',
  },
  el: {
    idiomatic: '"έχω δίκιο" (be right, lit. "have right"), "μου αρέσει" (I like — impersonal, non-compositional)',
    verbParticle: '"νοιάζομαι για" (care about), "εξαρτάται από" (depend on)',
    compoundTense: '"έχει φύγει" (has left — auxiliary + participle)',
    compoundPreposition: '"εκτός από" (except for/apart from)',
    doNotGroupExample: '"το φαγητό" (article + noun — obvious, do not group)',
  },
};

const SYSTEM_PROMPT = (languageConfig: LanguageConfig) => {
  const ex = EXAMPLES_BY_LANGUAGE[languageConfig.code];
  return `You are analyzing a ${languageConfig.promptLanguageName} sentence to
find word groups that should be explained together as a single unit for a language learner,
rather than word-by-word.

Group tokens together ONLY when they form:
- a fixed/idiomatic expression (e.g. ${ex.idiomatic})
- a verb + its required preposition/particle, when it is an integral, non-obvious part of the
  meaning (e.g. ${ex.verbParticle})
- a verb together with its auxiliary in a compound tense (e.g. ${ex.compoundTense})
- a compound preposition (e.g. ${ex.compoundPreposition})

Do NOT group:
- a verb with its direct object — that is ordinary syntax, not a fixed unit
- an article with its noun (e.g. ${ex.doNotGroupExample})
- anything whose meaning is already obvious word-by-word, even if the words are adjacent and one of
  them is a preposition — a preposition next to a word is not by itself a reason to group

Rules:
- A group must be made of CONSECUTIVE tokens, in the given order, by id.
- Only include tokens of type "word" — never punctuation.
- Groups must not overlap.
- Most sentences will have zero or very few groups — that is expected. Return an empty array if
  nothing in this sentence deserves grouping. Do not force a group to justify the call.
- Output strictly the JSON object per the schema — no prose outside it.`;
};

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

export async function markPhrasesForSentence(
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
        { role: 'system', content: SYSTEM_PROMPT(languageConfig) },
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
  model: string,
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
