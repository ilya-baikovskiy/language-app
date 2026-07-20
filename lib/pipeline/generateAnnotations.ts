// Шаг 5 пайплайна — обобщение scripts/generate-annotations.ts (тот же
// шаблон/schema из AI_PIPELINE.md), но теперь проходит по ВСЕМ единицам:
// и по фразовым группам из шага 4 (markPhrases.ts), и по одиночным словам,
// которые ни в одну группу не попали — а не только по «оставшимся после
// ручной разметки» токенам, как было в scripts/generate-annotations.ts.

import type { LanguageConfig } from './languageConfig.js';
import type { PhraseGroup } from './markPhrases.js';
import type { Annotation, Paragraph, Token } from '../../src/types/lesson.js';

export type AnnotationContent = Omit<Annotation, 'id' | 'type' | 'tokenIds'>;

export type AnnotationTarget = {
  tokenIds: string[];
  displayText: string;
  sentenceText: string;
  type: 'word' | 'phrase';
};

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
    'displayText', 'lemma', 'pronunciation', 'partOfSpeech', 'grammarLabel', 'shortTranslation',
    'contextualMeaning', 'constructionExplanation', 'grammarSummary', 'grammarDetails',
    'otherMeanings', 'examples',
  ],
  additionalProperties: false,
};

function systemPrompt(languageName: string, sourceLanguage: string): string {
  return `You are a ${languageName}-language teaching assistant embedded in a reading app.
A learner (${sourceLanguage}-speaking) clicked on a word or phrase while reading. Explain it the
way a good teacher would in a short, live aside — not a dictionary entry.

Rules:
- All explanatory text (contextualMeaning, grammarSummary, grammarDetails,
  constructionExplanation, otherMeanings[].note) must be written in ${sourceLanguage}, natural
  and concise.
- shortTranslation is a short ${sourceLanguage} gloss (a few words), not a full sentence.
- lemma, displayText, pronunciation, partOfSpeech, grammarLabel and examples[].targetText stay in
  ${languageName} (examples[].translation is in ${sourceLanguage}).
- contextualMeaning must explain the MEANING IN THIS SPECIFIC SENTENCE first — never open with a
  generic dictionary definition.
- If the target spans multiple tokens (a fixed phrase, a verb+preposition construction, a
  reflexive verb with its auxiliary), explain it as ONE unit — do not explain sub-parts separately.
- grammarSummary: 1-2 sentences, plain language, no textbook jargon. For very simple function
  words it's fine to keep this short or return null — do not pad.
- grammarDetails (only if there's a genuinely useful deeper point — tense contrast, an irregular
  form, a common learner mistake): 2-4 sentences max, otherwise null.
- Provide exactly 2 examples: short, natural ${languageName} sentences roughly at the learner's
  level, using the same word/construction, each with a ${sourceLanguage} translation.
- Never invent grammar that isn't true. If unsure, return null for that field rather than guess.
- Output strictly the JSON object per the schema.`;
}

export function collectAnnotationTargets(paragraphs: Paragraph[], phraseGroups: PhraseGroup[]): AnnotationTarget[] {
  const tokensById = new Map<string, { token: Token; sentenceText: string }>();
  for (const paragraph of paragraphs) {
    for (const sentence of paragraph.sentences) {
      for (const token of sentence.tokens) {
        tokensById.set(token.id, { token, sentenceText: sentence.text });
      }
    }
  }

  const covered = new Set<string>();
  const targets: AnnotationTarget[] = [];

  for (const group of phraseGroups) {
    const entries = group.tokenIds.map((id) => tokensById.get(id)).filter((e): e is NonNullable<typeof e> => !!e);
    if (entries.length !== group.tokenIds.length) continue;
    group.tokenIds.forEach((id) => covered.add(id));
    targets.push({
      tokenIds: group.tokenIds,
      displayText: entries.map((e) => e.token.text).join(' '),
      sentenceText: entries[0].sentenceText,
      type: 'phrase',
    });
  }

  for (const paragraph of paragraphs) {
    for (const sentence of paragraph.sentences) {
      for (const token of sentence.tokens) {
        if (token.type === 'word' && !covered.has(token.id)) {
          targets.push({ tokenIds: [token.id], displayText: token.text, sentenceText: sentence.text, type: 'word' });
        }
      }
    }
  }

  return targets;
}

export async function generateAnnotationContent(
  target: AnnotationTarget,
  languageConfig: LanguageConfig,
  level: string,
  sourceLanguage: string,
  apiKey: string,
  model: string,
): Promise<AnnotationContent> {
  const userPrompt = `Language: ${languageConfig.promptLanguageName}
Learner level: ${level}
Full sentence: "${target.sentenceText}"
Target span in the sentence: "${target.displayText}"
Token type: ${target.type}`;

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

// Ленивая генерация контента (см. CLAUDE.md/PROGRESS.md): на этапе создания
// урока OpenAI больше не вызывается для каждого слова/фразы — только эта
// чистая функция, которая проставляет annotationId по той же id-схеме, что и
// mergeAnnotationResults, но без сети и без объектов Annotation.
// lesson.annotations стартует пустым — фразовая группировка в UI
// (InteractiveSentence.tsx схлопывает соседние токены с одинаковым
// annotationId) работает сразу, а сам текст объяснения дозапрашивается по
// клику (см. useSelectedAnnotation.ts) и резолвится обратно в AnnotationTarget
// через resolveAnnotationTarget (src/lib/lessonText.ts).
export function stampAnnotationTargets(paragraphs: Paragraph[], targets: AnnotationTarget[]): Paragraph[] {
  const annotationIdByTokenId = new Map<string, string>();
  for (const target of targets) {
    const annotationId = `gen-${target.tokenIds.join('-')}`;
    target.tokenIds.forEach((id) => annotationIdByTokenId.set(id, annotationId));
  }

  return paragraphs.map((paragraph) => ({
    ...paragraph,
    sentences: paragraph.sentences.map((sentence) => ({
      ...sentence,
      tokens: sentence.tokens.map((token) => {
        const annotationId = annotationIdByTokenId.get(token.id);
        return annotationId ? { ...token, annotationId } : token;
      }),
    })),
  }));
}

export type AnnotationResult = { target: AnnotationTarget; content: AnnotationContent };

// Чистая функция, без сети/секретов — переиспользуется и CLI (generateAnnotationsForLesson
// ниже), и клиентским оркестратором (src/services/generation/), который сам дёргает
// api/generate-annotation.ts по одной единице за раз и потом мёржит результаты этой же
// функцией. ВАЖНО: у фразовой аннотации несколько tokenIds — каждый из них должен получить
// один и тот же annotationId, иначе группировка в UI (InteractiveSentence.tsx схлопывает
// соседние токены с одинаковым annotationId) не соберёт фразу целиком.
export function mergeAnnotationResults(
  paragraphs: Paragraph[],
  results: (AnnotationResult | null)[],
): { paragraphs: Paragraph[]; annotations: Annotation[] } {
  const annotationIdByTokenId = new Map<string, string>();
  const annotations: Annotation[] = [];
  for (const r of results) {
    if (!r) continue;
    const { target, content } = r;
    const annotationId = `gen-${target.tokenIds.join('-')}`;
    target.tokenIds.forEach((id) => annotationIdByTokenId.set(id, annotationId));
    annotations.push({ id: annotationId, type: target.type, tokenIds: target.tokenIds, ...content });
  }

  const nextParagraphs = paragraphs.map((paragraph) => ({
    ...paragraph,
    sentences: paragraph.sentences.map((sentence) => ({
      ...sentence,
      tokens: sentence.tokens.map((token) => {
        const annotationId = annotationIdByTokenId.get(token.id);
        return annotationId ? { ...token, annotationId } : token;
      }),
    })),
  }));

  return { paragraphs: nextParagraphs, annotations };
}

export async function generateAnnotationsForLesson(
  paragraphs: Paragraph[],
  phraseGroups: PhraseGroup[],
  languageConfig: LanguageConfig,
  options: { level: string; sourceLanguage: string; concurrency?: number; onProgress?: (done: number, total: number, failed: number) => void },
  apiKey: string,
  model: string,
): Promise<{ paragraphs: Paragraph[]; annotations: Annotation[] }> {
  const targets = collectAnnotationTargets(paragraphs, phraseGroups);
  const concurrency = options.concurrency ?? 2;

  let done = 0;
  let failed = 0;
  const results = await mapWithConcurrency(targets, concurrency, async (target) => {
    try {
      const content = await generateAnnotationContent(target, languageConfig, options.level, options.sourceLanguage, apiKey, model);
      done++;
      options.onProgress?.(done, targets.length, failed);
      return { target, content };
    } catch (err) {
      failed++;
      options.onProgress?.(done, targets.length, failed);
      console.error(`\n✗ "${target.displayText}":`, err instanceof Error ? err.message : err);
      return null;
    }
  });

  return mergeAnnotationResults(paragraphs, results);
}
