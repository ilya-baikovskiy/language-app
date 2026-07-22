// Шаг 5 пайплайна — Bottom Sheet v2 (см. AI_PIPELINE.md, решение «каждое слово
// кликабельно само по себе»). Раньше объяснение генерировалось на ГРУППУ
// токенов, заранее собранную отдельным AI-шагом (markPhrases.ts, шаг 4) —
// теперь группировки при генерации урока нет вообще: каждый word-токен сам
// себе цель, а «связанная фраза» (напр. στον → στον σταθμό) — это подсказка
// ВНУТРИ объяснения одного токена, не смена того, что было выбрано.

import type { LanguageConfig } from './languageConfig.js';
import type {
  Annotation,
  AnnotationHint,
  AnnotationSummary,
  DetailSection,
  Sentence,
  Token,
} from '../../src/types/lesson.js';

export type AnnotationTarget = { tokenId: string; sentence: Sentence };

function targetToken(target: AnnotationTarget): Token {
  const token = target.sentence.tokens.find((t) => t.id === target.tokenId);
  if (!token) throw new Error(`token ${target.tokenId} not found in sentence ${target.sentence.id}`);
  return token;
}

// Соседние word-токены, содержащие целевой — та же проверка, что раньше жила
// в markPhrases.ts (isConsecutiveWordSpan), перенесена сюда: связанная фраза
// обязана быть непрерывным куском предложения, включающим сам выбранный
// токен, иначе это не "контекст для этого слова", а что-то другое.
export function isValidRelatedSpan(sentence: Sentence, targetTokenId: string, tokenIds: string[]): boolean {
  if (tokenIds.length < 2) return false;
  if (!tokenIds.includes(targetTokenId)) return false;
  const indices = tokenIds.map((id) => sentence.tokens.findIndex((t) => t.id === id));
  if (indices.some((i) => i === -1)) return false;
  if (indices.some((i) => sentence.tokens[i].type !== 'word')) return false;
  const sorted = [...indices].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) return false;
  }
  return true;
}

function relatedSourceText(sentence: Sentence, tokenIds: string[]): string {
  const order = new Map(sentence.tokens.map((t, i) => [t.id, i]));
  const sorted = [...tokenIds].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return sorted.map((id) => sentence.tokens.find((t) => t.id === id)!.text).join(' ');
}

// Примеры — язык-специфичные (перенесены из markPhrases.ts): все примеры
// раньше были французскими независимо от языка урока, что на греческом давало
// сверхгруппировку ("Μετά το φαγητό" как одна фраза — обычная составная
// конструкция, не идиома). Тот же риск здесь: модель должна понимать, что
// действительно стоит показать как "связанное", а не любой соседний предлог.
type RelatedPhraseExamples = { worthShowing: string; notWorthShowing: string };

const RELATED_EXAMPLES_BY_LANGUAGE: Record<string, RelatedPhraseExamples> = {
  fr: {
    worthShowing: '"décider de" (глагол + неочевидный обязательный предлог), "s\'est assise" (возвратный глагол + вспомогательный)',
    notWorthShowing: '"la gare" (артикль + существительное — само слово "gare" уже понятно без соседа)',
  },
  de: {
    worthShowing: '"steht … auf" (отделяемая приставка глагола — aufstehen), "hat sich gesetzt" (возвратный глагол + вспомогательный)',
    notWorthShowing: '"das Essen" (артикль + существительное)',
  },
  en: {
    worthShowing: '"look forward to", "give up" (фразовый глагол — смысл не складывается из частей по отдельности)',
    notWorthShowing: '"the food" (артикль + существительное)',
  },
  el: {
    worthShowing: '"στον σταθμό" (σε+τον слито в στον — форма без соседа не понятна), "μου αρέσει" (безличная конструкция)',
    notWorthShowing: '"το φαγητό" (артикль + существительное — обычная составная конструкция, не идиома)',
  },
};

// Ярлыки строки-связки. Закрытый список специально: в эталоне это подписанный
// слот с предсказуемой подписью, а не свободный заголовок. «Словарной формы»
// в списке нет намеренно — начальная форма наверху запрещена (§5 хэндоффа).
export const HINT_IN_SENTENCE = 'В этом предложении';
export const HINT_OTHER_MEANING = 'Другое значение';

type RawSummaryResponse = {
  partOfSpeech: string | null;
  translation: string;
  contextTranslation: string;
  relatedTokenIds: string[] | null;
  relatedTranslation: string | null;
  otherMeaningSource: string | null;
  otherMeaningTranslation: string | null;
};

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    partOfSpeech: { type: ['string', 'null'] },
    translation: { type: 'string' },
    contextTranslation: { type: 'string' },
    relatedTokenIds: { type: ['array', 'null'], items: { type: 'string' } },
    relatedTranslation: { type: ['string', 'null'] },
    otherMeaningSource: { type: ['string', 'null'] },
    otherMeaningTranslation: { type: ['string', 'null'] },
  },
  required: [
    'partOfSpeech',
    'translation',
    'contextTranslation',
    'relatedTokenIds',
    'relatedTranslation',
    'otherMeaningSource',
    'otherMeaningTranslation',
  ],
  additionalProperties: false,
};

const SECTION_SCHEMA = {
  type: 'array',
  items: {
    anyOf: [
      {
        type: 'object',
        properties: {
          type: { type: 'string', const: 'explanation' },
          title: { type: ['string', 'null'] },
          body: { type: 'string' },
        },
        required: ['type', 'title', 'body'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: {
          type: { type: 'string', const: 'table' },
          title: { type: ['string', 'null'] },
          rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
          note: { type: ['string', 'null'] },
        },
        required: ['type', 'title', 'rows', 'note'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: {
          type: { type: 'string', const: 'bilingualPairs' },
          title: { type: ['string', 'null'] },
          pairs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                source: { type: 'string' },
                translation: { type: 'string' },
                note: { type: ['string', 'null'] },
              },
              required: ['source', 'translation', 'note'],
              additionalProperties: false,
            },
          },
        },
        required: ['type', 'title', 'pairs'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: { type: { type: 'string', const: 'grammarNote' }, body: { type: 'string' } },
        required: ['type', 'body'],
        additionalProperties: false,
      },
    ],
  },
};

const DETAILS_SCHEMA = {
  type: 'object',
  properties: { sections: SECTION_SCHEMA },
  required: ['sections'],
  additionalProperties: false,
};

function summarySystemPrompt(languageConfig: LanguageConfig, sourceLanguage: string): string {
  const ex = RELATED_EXAMPLES_BY_LANGUAGE[languageConfig.code] ?? RELATED_EXAMPLES_BY_LANGUAGE.fr;
  return `You are a ${languageConfig.promptLanguageName}-language teaching assistant embedded in a reading app.
A learner (${sourceLanguage}-speaking) tapped exactly ONE word while reading. Give the FIRST, essential
explanation — what it means HERE — like a good teacher in a short live aside. NO grammar terminology
beyond a plain part-of-speech label (that comes later, on demand).

The tapped word is always the exact target — never substitute a surrounding phrase for it. You MAY
point out a related phrase around it ONLY when the word genuinely cannot be understood well in
isolation (e.g. ${ex.worthShowing}). Do NOT do this for ordinary adjacent words that are each already
clear on their own (e.g. ${ex.notWorthShowing}) — most words have no related phrase, that's expected.
If you do include one, relatedTokenIds must be a CONSECUTIVE run of word-token ids from the given
token list that includes the target token id itself.

Rules:
- translation: a short, natural ${sourceLanguage} gloss of the word AS IT APPEARS HERE (a few words,
  not a sentence). If the target language doesn't lexically encode something ${sourceLanguage} needs
  (e.g. grammatical gender), pick the form the SENTENCE's context implies and don't explain the
  mechanism here — that belongs in details, not the summary.
- contextTranslation: a natural, idiomatic ${sourceLanguage} translation of the WHOLE sentence — not
  a literal word-by-word rendering, and not a grammar explanation.
- partOfSpeech: a plain ${sourceLanguage} word for the part of speech ("глагол", "предлог"...), or null
  if not useful (e.g. a proper name).
- relatedTranslation: natural ${sourceLanguage} translation of ONLY the related phrase, matching how it
  reads inside the sentence — null whenever relatedTokenIds is null.
- otherMeaningSource / otherMeaningTranslation: ONLY for a word that carries a genuinely different
  second meaning a learner will meet soon (e.g. Greek "γιατί" = "потому что" here, but "Γιατί;" =
  "Почему?" as a question). Both null otherwise — this is rare, do not invent one to fill the slot.
- NEVER return a dictionary/base form as the "other meaning" (no "πηγαίνω", no "μικρός", no infinitive).
  The base form is deliberately NOT shown above the context — it distracts from reading. If the base
  form is worth teaching, it belongs in the details sections, not here.
- Never invent grammar or vocabulary. Output strictly the JSON object per the schema.`;
}

function detailsSystemPrompt(languageConfig: LanguageConfig, sourceLanguage: string): string {
  return `You are a ${languageConfig.promptLanguageName}-language teaching assistant embedded in a reading app.
A ${sourceLanguage}-speaking learner tapped "more" on a single word. The short meaning was already
shown — do not repeat it. Return ONLY the sections that add genuinely new, useful knowledge about
THIS word; most words need very few. An empty array is a correct answer for a trivial word.

Give every section a short, plain ${sourceLanguage} "title" (e.g. "Как это работает", "Формы
прошедшего времени", "Полезно запомнить", "Два значения") — a null title is only acceptable for
"grammarNote", which renders as a closing remark.

Section types available — use whichever fit, in a sensible reading order:
- "explanation": one focused point in plain ${sourceLanguage}, no jargon dump. Use this for "how this
  form works" (e.g. why this tense/case is used here). Usually the FIRST section, titled
  "Как это работает".
- "table": rows of 2-3 cells; there is NO header row, so the first cell of each row must itself be the
  label ("я", "ты", "сейчас / обычно", "вопрос", "причина"). EVERY row that shows a
  ${languageConfig.promptLanguageName} form must also carry a ${sourceLanguage} cell translating it —
  never a grid of bare forms (a singular/plural grid with no translation is NOT acceptable).
  For a verb's tense comparison use the FIRST PERSON "я" consistently across all rows
  (e.g. πηγαίνω / πήγα / θα πάω = "я иду" / "я пошёл" / "я пойду"), never mixing persons.
  "note" is an optional short closing line under the table, e.g. pointing out how the forms look for a
  different person — null when not needed.
- "bilingualPairs": 2-4 short ${languageConfig.promptLanguageName} examples with idiomatic (never
  mechanically literal) ${sourceLanguage} translations — similar constructions, not random sentences.
  Each pair may carry a short "note" (e.g. "мужской род") — null when not useful.
- "grammarNote": one short technical closing line, only if a learner would actually look this up —
  not required for most words. Grammar terms go in ${sourceLanguage} too ("аорист, 3-е лицо,
  единственное число"), never in English.

Hard rules:
- EVERY word you write — titles, bodies, table labels, notes — is in ${sourceLanguage}, except the
  ${languageConfig.promptLanguageName} forms and examples themselves. Never answer in English.
- Do not add a section that only restates the sentence already shown in the summary's context block.
- No invented grammar. If a language doesn't have a category ${sourceLanguage} speakers might expect
  (e.g. no grammatical gender, no case marking), say so briefly instead of forcing a comparison.
- Never write a title in ALL CAPS.
- Output strictly the JSON object per the schema — no prose outside it.`;
}

function targetUserPrompt(target: AnnotationTarget, languageConfig: LanguageConfig, level: string): string {
  const wordTokens = target.sentence.tokens.filter((t) => t.type === 'word').map((t) => ({ id: t.id, text: t.text }));
  return `Language: ${languageConfig.promptLanguageName}
Learner level: ${level}
Full sentence: "${target.sentence.text}"
Sentence tokens (in order): ${JSON.stringify(wordTokens)}
Target token id: "${target.tokenId}"
Target token text: "${targetToken(target).text}"`;
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

// Тир 1 — короткое объяснение (по клику по слову). Раздельно и посимвольно
// проверенная связанная фраза — не доверяем модели дословный текст, только
// её решение "какие id" и перевод, сам текст собираем из наших же токенов.
export async function generateAnnotationBasic(
  target: AnnotationTarget,
  languageConfig: LanguageConfig,
  level: string,
  sourceLanguage: string,
  apiKey: string,
  model: string,
): Promise<AnnotationSummary> {
  const raw = await callAnnotationModel<RawSummaryResponse>(
    'annotation_summary',
    SUMMARY_SCHEMA,
    summarySystemPrompt(languageConfig, sourceLanguage),
    targetUserPrompt(target, languageConfig, level),
    apiKey,
    model,
  );

  const token = targetToken(target);
  const relatedValid = raw.relatedTokenIds && isValidRelatedSpan(target.sentence, target.tokenId, raw.relatedTokenIds);
  const relatedSource = relatedValid ? relatedSourceText(target.sentence, raw.relatedTokenIds!) : null;
  const relatedTranslation = relatedValid ? raw.relatedTranslation : null;

  return {
    partOfSpeech: raw.partOfSpeech,
    displayForm: token.text,
    translation: raw.translation,
    audioText: token.text,
    hint: buildHint(relatedSource, relatedTranslation, raw),
    context: {
      source: target.sentence.text,
      translation: raw.contextTranslation,
      selectedSource: token.text,
      selectedTranslation: raw.translation,
      relatedSource,
      relatedTranslation,
    },
  };
}

// Строка-связка под переводом. Связанная фраза из самого предложения важнее
// «другого значения» — она объясняет именно то, что человек сейчас читает.
// Ярлык не приходит от модели (иначе он рано или поздно станет «Словарной
// формой», которой тут быть не должно) — он выводится из того, какой слот занят.
export function buildHint(
  relatedSource: string | null,
  relatedTranslation: string | null,
  raw: Pick<RawSummaryResponse, 'otherMeaningSource' | 'otherMeaningTranslation'>,
): AnnotationHint | null {
  if (relatedSource && relatedTranslation) {
    return { label: HINT_IN_SENTENCE, source: relatedSource, translation: relatedTranslation };
  }
  if (raw.otherMeaningSource && raw.otherMeaningTranslation) {
    return { label: HINT_OTHER_MEANING, source: raw.otherMeaningSource, translation: raw.otherMeaningTranslation };
  }
  return null;
}

// Тир 2 — секции по запросу «Подробнее». Тяжелее — генерим только когда
// пользователь реально захотел деталей.
export async function generateAnnotationDetails(
  target: AnnotationTarget,
  languageConfig: LanguageConfig,
  level: string,
  sourceLanguage: string,
  apiKey: string,
  model: string,
): Promise<{ sections: DetailSection[] }> {
  return callAnnotationModel(
    'annotation_details',
    DETAILS_SCHEMA,
    detailsSystemPrompt(languageConfig, sourceLanguage),
    targetUserPrompt(target, languageConfig, level),
    apiKey,
    model,
  );
}

// Полный контент (оба тира сразу) — для CLI/офлайн-прогона, где урок
// собирается целиком и стоимость параллельных вызовов не важна.
export async function generateAnnotationContent(
  target: AnnotationTarget,
  languageConfig: LanguageConfig,
  level: string,
  sourceLanguage: string,
  apiKey: string,
  model: string,
): Promise<Annotation> {
  const [summary, details] = await Promise.all([
    generateAnnotationBasic(target, languageConfig, level, sourceLanguage, apiKey, model),
    generateAnnotationDetails(target, languageConfig, level, sourceLanguage, apiKey, model),
  ]);
  return { id: target.tokenId, summary, details };
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

// CLI/офлайн-путь: генерирует объяснения для ВСЕХ word-токенов урока сразу
// (веб-путь этого не делает — там контент лениво тянется по клику, см.
// generateLessonPipeline.ts). Каждый word-токен — своя цель, группировки
// больше нет ни на этом шаге, ни раньше него.
export async function generateAnnotationsForLesson(
  sentences: Sentence[],
  languageConfig: LanguageConfig,
  options: { level: string; sourceLanguage: string; concurrency?: number; onProgress?: (done: number, total: number, failed: number) => void },
  apiKey: string,
  model: string,
): Promise<Annotation[]> {
  const targets: AnnotationTarget[] = sentences.flatMap((sentence) =>
    sentence.tokens.filter((t) => t.type === 'word').map((t) => ({ tokenId: t.id, sentence })),
  );
  const concurrency = options.concurrency ?? 2;

  let done = 0;
  let failed = 0;
  const results = await mapWithConcurrency(targets, concurrency, async (target) => {
    try {
      const annotation = await generateAnnotationContent(target, languageConfig, options.level, options.sourceLanguage, apiKey, model);
      done++;
      options.onProgress?.(done, targets.length, failed);
      return annotation;
    } catch (err) {
      failed++;
      options.onProgress?.(done, targets.length, failed);
      console.error(`\n✗ "${targetToken(target).text}":`, err instanceof Error ? err.message : err);
      return null;
    }
  });

  return results.filter((a): a is Annotation => a !== null);
}
