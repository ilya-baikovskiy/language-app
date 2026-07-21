// Шаг 5 пайплайна — обобщение scripts/generate-annotations.ts (тот же
// шаблон/schema из AI_PIPELINE.md), но теперь проходит по ВСЕМ единицам:
// и по фразовым группам из шага 4 (markPhrases.ts), и по одиночным словам,
// которые ни в одну группу не попали — а не только по «оставшимся после
// ручной разметки» токенам, как было в scripts/generate-annotations.ts.

import type { LanguageConfig } from './languageConfig.js';
import type { PhraseGroup } from './markPhrases.js';
import type { Annotation, Paragraph, Token } from '../../src/types/lesson.js';

// Полный контент = базовый (тир 1) ∪ детали (тир 2). Ленивый фетч тянет их по
// отдельности: тир 1 по клику по слову, тир 2 по клику «Подробнее»
// (см. useSelectedAnnotation.ts). CLI/офлайн генерит оба сразу и склеивает.
export type AnnotationBasicContent = Pick<
  Annotation,
  | 'displayText' | 'lemma' | 'pronunciation' | 'partOfSpeech' | 'shortTranslation'
  | 'contextualMeaning' | 'baseForm' | 'formInText' | 'wholePhrase' | 'beginnerBreakdown'
  | 'plainLearningNote'
>;

export type AnnotationDetailsContent = Pick<
  Annotation,
  | 'grammarLabel' | 'grammarSummary' | 'grammarDetails' | 'constructionExplanation'
  | 'formVariants' | 'examples' | 'otherMeanings'
>;

export type AnnotationContent = AnnotationBasicContent & AnnotationDetailsContent;

export type AnnotationTarget = {
  tokenIds: string[];
  displayText: string;
  sentenceText: string;
  type: 'word' | 'phrase';
};

// Иностранная форма + перевод (nullable как объект целиком).
const FORM_PAIR_SCHEMA = {
  type: ['object', 'null'],
  properties: { text: { type: 'string' }, meaning: { type: 'string' } },
  required: ['text', 'meaning'],
  additionalProperties: false,
};

const BASIC_SCHEMA = {
  type: 'object',
  properties: {
    displayText: { type: 'string' },
    lemma: { type: 'string' },
    pronunciation: { type: ['string', 'null'] },
    partOfSpeech: { type: ['string', 'null'] },
    shortTranslation: { type: 'string' },
    contextualMeaning: { type: 'string' },
    baseForm: FORM_PAIR_SCHEMA,
    formInText: FORM_PAIR_SCHEMA,
    wholePhrase: FORM_PAIR_SCHEMA,
    beginnerBreakdown: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, meaning: { type: 'string' }, note: { type: ['string', 'null'] } },
        required: ['text', 'meaning', 'note'],
        additionalProperties: false,
      },
    },
    plainLearningNote: { type: ['string', 'null'] },
  },
  required: [
    'displayText', 'lemma', 'pronunciation', 'partOfSpeech', 'shortTranslation',
    'contextualMeaning', 'baseForm', 'formInText', 'wholePhrase', 'beginnerBreakdown',
    'plainLearningNote',
  ],
  additionalProperties: false,
};

const DETAILS_SCHEMA = {
  type: 'object',
  properties: {
    grammarLabel: { type: ['string', 'null'] },
    grammarSummary: { type: ['string', 'null'] },
    grammarDetails: { type: ['string', 'null'] },
    constructionExplanation: { type: ['string', 'null'] },
    formVariants: {
      type: ['object', 'null'],
      properties: {
        title: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              meaning: { type: 'string' },
              note: { type: ['string', 'null'] },
              isCurrent: { type: 'boolean' },
            },
            required: ['text', 'meaning', 'note', 'isCurrent'],
            additionalProperties: false,
          },
        },
      },
      required: ['title', 'items'],
      additionalProperties: false,
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
    otherMeanings: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        properties: { translation: { type: 'string' }, note: { type: ['string', 'null'] } },
        required: ['translation', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'grammarLabel', 'grammarSummary', 'grammarDetails', 'constructionExplanation',
    'formVariants', 'examples', 'otherMeanings',
  ],
  additionalProperties: false,
};

function basicSystemPrompt(languageName: string, sourceLanguage: string): string {
  return `You are a ${languageName}-language teaching assistant embedded in a reading app.
A learner (${sourceLanguage}-speaking) clicked a word or phrase while reading. Give the FIRST,
essential explanation — what it means HERE — like a good teacher in a short live aside. This is the
basic tier: NO grammar terminology at all (that comes later, on demand).

Rules:
- All explanatory text (contextualMeaning, meanings, notes, plainLearningNote) in ${sourceLanguage},
  natural and concise.
- shortTranslation: a short ${sourceLanguage} gloss (a few words), not a sentence.
- Every ${languageName} form you output (baseForm.text, formInText.text, wholePhrase.text,
  beginnerBreakdown[].text) MUST be paired with its ${sourceLanguage} meaning — never leave a foreign
  form without a translation.
- contextualMeaning: explain the MEANING IN THIS SPECIFIC SENTENCE first, in plain words, no dictionary
  opener, no grammar terms.
- baseForm: the dictionary/base form + ${sourceLanguage} translation — infinitive for a verb
  ("arriver → …"), the base expression or a model for a construction ("commencer à + infinitif → …"),
  the base noun/adjective otherwise.
- formInText: the form EXACTLY as it appears in the sentence + its ${sourceLanguage} meaning in this
  context ("arrivait → …"). If it is identical to baseForm and adds nothing, return null.
- wholePhrase: ONLY when the target is a multi-word phrase — the whole phrase reassembled + a natural
  ${sourceLanguage} translation. For a single word, return null.
- beginnerBreakdown: ONLY for phrases or genuinely complex forms — 3–6 MEANINGFUL chunks (do not split
  every article/preposition), each = ${languageName} text + short ${sourceLanguage} meaning + optional
  tiny note. Do NOT put the whole phrase as the last item (it is shown separately). For a trivial single
  word, return null.
- plainLearningNote: one short practical tip in ${sourceLanguage} (e.g. "recognize the whole phrase as
  one unit, don't translate word by word"), or null. No grammar jargon.
- Never invent. If unsure about a field, return null rather than guess.
- Output strictly the JSON object per the schema.`;
}

function detailsSystemPrompt(languageName: string, sourceLanguage: string): string {
  return `You are a ${languageName}-language teaching assistant embedded in a reading app.
A ${sourceLanguage}-speaking learner tapped "more" on a word or phrase. Give the DEEPER explanation —
grammar and forms. The basic meaning was already shown, so do not repeat it.

Rules:
- All explanatory text (grammarSummary, grammarDetails, constructionExplanation, meanings, notes) in
  ${sourceLanguage}, natural and concise.
- grammarLabel: the standard grammar term for this form ("imparfait", "passé composé", …), or null for
  a trivial word.
- grammarSummary: 1–2 sentences in plain ${sourceLanguage}. If you use the term, explain it in the same
  breath. No padding; null for a very simple word.
- grammarDetails: only if there is a genuinely useful deeper point (tense contrast, an irregular form, a
  common learner mistake) — 2–4 sentences, otherwise null.
- constructionExplanation: for a verb+preposition / fixed construction, explain the pattern (e.g. the
  required preposition); otherwise null.
- formVariants: 3–5 useful forms of this unit, each ${languageName} form paired with its
  ${sourceLanguage} meaning, mark the one matching the text with isCurrent=true. Choose what fits the word
  type (verb → a few persons/tenses; adjective/noun → gender/number; expression → its common shapes) and
  give the list a short title. NOT a full paradigm table. null if not useful.
- examples: EXACTLY 2 short, natural ${languageName} sentences at the learner's level using the same
  word/construction, each with a ${sourceLanguage} translation.
- otherMeanings: other common meanings of the unit if relevant, else null.
- Never invent grammar. If unsure, return null rather than guess.
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

function annotationUserPrompt(target: AnnotationTarget, languageConfig: LanguageConfig, level: string): string {
  return `Language: ${languageConfig.promptLanguageName}
Learner level: ${level}
Full sentence: "${target.sentenceText}"
Target span in the sentence: "${target.displayText}"
Token type: ${target.type}`;
}

async function callAnnotationModel<T>(
  schemaName: string,
  schema: object,
  systemPromptText: string,
  userPrompt: string,
  apiKey: string,
  model: string,
): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPromptText },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
        temperature: 0.4,
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as { choices: { message: { content: string } }[] };
      return JSON.parse(json.choices[0].message.content) as T;
    }
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      continue;
    }
    throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  }
  throw new Error('unreachable');
}

// Тир 1 — базовое объяснение (по клику по слову). Быстро/дёшево.
export function generateAnnotationBasic(
  target: AnnotationTarget,
  languageConfig: LanguageConfig,
  level: string,
  sourceLanguage: string,
  apiKey: string,
  model: string,
): Promise<AnnotationBasicContent> {
  return callAnnotationModel(
    'annotation_basic',
    BASIC_SCHEMA,
    basicSystemPrompt(languageConfig.promptLanguageName, sourceLanguage),
    annotationUserPrompt(target, languageConfig, level),
    apiKey,
    model,
  );
}

// Тир 2 — грамматика и формы (по клику «Подробнее»). Тяжелее — генерим только
// если пользователь реально захотел деталей.
export function generateAnnotationDetails(
  target: AnnotationTarget,
  languageConfig: LanguageConfig,
  level: string,
  sourceLanguage: string,
  apiKey: string,
  model: string,
): Promise<AnnotationDetailsContent> {
  return callAnnotationModel(
    'annotation_details',
    DETAILS_SCHEMA,
    detailsSystemPrompt(languageConfig.promptLanguageName, sourceLanguage),
    annotationUserPrompt(target, languageConfig, level),
    apiKey,
    model,
  );
}

// Полный контент — оба тира сразу. Для CLI/офлайн-прогона (стоимость не важна),
// где урок собирается целиком; ленивый клиент вызывает тиры по отдельности.
export async function generateAnnotationContent(
  target: AnnotationTarget,
  languageConfig: LanguageConfig,
  level: string,
  sourceLanguage: string,
  apiKey: string,
  model: string,
): Promise<AnnotationContent> {
  const [basic, details] = await Promise.all([
    generateAnnotationBasic(target, languageConfig, level, sourceLanguage, apiKey, model),
    generateAnnotationDetails(target, languageConfig, level, sourceLanguage, apiKey, model),
  ]);
  return { ...basic, ...details };
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
