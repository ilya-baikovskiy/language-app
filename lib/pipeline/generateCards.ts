// Pipeline A — подготовка карточек-идей (см.
// docs/content-system-v1.2/07_AI_CONTENT_GENERATION_PIPELINE.md §2). Дешёвый,
// языко-независимый шаг: тема+страна → канонический ContentCard-кандидат на
// русском. НЕ путать с Pipeline B (blueprint.ts/cardGeneration.ts) — тот берёт
// уже выбранную карточку и генерирует полноценный Lesson на activeLanguage,
// это дорогой шаг, запускается только по клику пользователя.
//
// Сознательное упрощение относительно полного GeneratedCardCandidate из 07 §2:
// поля primaryLearningNodeCodes/secondaryLearningNodeCodes/whyInteresting/
// whyLevelAppropriate/sourceRefs/factualClaimsToVerify опущены — они
// привязаны к Phase 6 (learning plan) и источниковедческой политике (14),
// которых в проекте ещё нет. Добавить, когда появится LearningStateRepository
// и реальный source registry, а не раньше.

export type CardGenerationRequest = {
  desiredCount: number;
  enabledTopicIds: string[]; // id из catalog.ts TOPICS, только они разрешены
  enabledCountryOrRegionIds: string[]; // id из catalog.ts COUNTRIES, только они разрешены
  existingSubjectKeys: string[]; // не повторять уже существующие идеи (seed + пул)
};

export type GeneratedCardCandidate = {
  canonicalSubjectKey: string; // короткий kebab-case английский slug, как в seed-карточках
  editorialTitleRu: string;
  editorialDescriptionRu: string;
  emoji: string;
  topicIds: string[];
  countryOrRegionIds: string[];
  format: string;
  provenanceType: string;
  estimatedReadingSeconds: number;
  learningFocusLabelRu: string;
};

const CANDIDATE_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          canonicalSubjectKey: { type: 'string' },
          editorialTitleRu: { type: 'string' },
          editorialDescriptionRu: { type: 'string' },
          emoji: { type: 'string' },
          topicIds: { type: 'array', items: { type: 'string' } },
          countryOrRegionIds: { type: 'array', items: { type: 'string' } },
          format: { type: 'string' },
          provenanceType: { type: 'string' },
          estimatedReadingSeconds: { type: 'number' },
          learningFocusLabelRu: { type: 'string' },
        },
        required: [
          'canonicalSubjectKey',
          'editorialTitleRu',
          'editorialDescriptionRu',
          'emoji',
          'topicIds',
          'countryOrRegionIds',
          'format',
          'provenanceType',
          'estimatedReadingSeconds',
          'learningFocusLabelRu',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['candidates'],
  additionalProperties: false,
};

const CONTENT_FORMATS = [
  'calm_story',
  'story_with_dialogue',
  'practical_dialogue',
  'cultural_miniature',
  'fact_explainer',
  'historical_episode',
  'place_portrait',
  'adapted_article',
  'current_event',
  'language_note',
  'serialized_story_episode',
  'user_text_adaptation',
];

const PROVENANCE_TYPES = ['ai_fiction', 'source_based_explainer', 'adapted_article', 'current_event', 'user_text'];

function buildSystemPrompt(): string {
  return `You invent short-reading-material IDEAS (not the material itself) for a language-learning
app's content feed. Each idea is a canonical, language-independent "card": a Russian editorial title,
description, and metadata. The actual lesson text is written LATER, in whatever language the learner
picked — you never write lesson text here, only the idea.

Rules for each candidate:
- editorialTitleRu: a short, genuinely catchy Russian title that names the PLACE DIRECTLY — a specific
  country/region/city/island, never a generic noun standing in for it. Bad: "Страна, которая голосует
  каждые три месяца". Good: "Швейцария, которая голосует каждые три месяца". Bad: "Остров, где строят
  дома из вулканического камня". Good: "Остров Санторини, где строят дома из вулканического камня".
- editorialDescriptionRu: 1-2 plain Russian sentences, ending with a short "В тексте: ..." clause
  listing 2-4 concrete words/notions the reading will cover (matches the app's existing card style).
- emoji: 1-2 emoji characters, normally topic emoji + country/region flag or symbol (e.g. "🌋🇬🇷",
  "🗣️🇨🇭") — never a photo-realistic description, just the characters.
- topicIds: 1-2 ids, ONLY from the enabled topic list given below — never invent a new id.
- countryOrRegionIds: usually exactly ONE id from the enabled country/region list given below (title
  clarity needs one concrete place) — never invent a new id.
- format: one of ${CONTENT_FORMATS.join(', ')} — pick whichever matches the idea.
- provenanceType: one of ${PROVENANCE_TYPES.join(', ')} — "ai_fiction" for an invented story/dialogue
  premise, "source_based_explainer" for a factual idea (the actual fact-checking happens later, in
  Pipeline B — here it's just an honest label of what kind of idea this is).
- canonicalSubjectKey: a short kebab-case English slug uniquely identifying the idea (e.g.
  "santorini-volcanic-rock-houses") — must NOT match any key in the existing-subjects list given below,
  and must be genuinely distinct in idea from every other candidate you produce in this same batch.
- estimatedReadingSeconds: a realistic short-reading estimate, usually 60-180.
- learningFocusLabelRu: a short Russian label naming the grammar/vocabulary focus (e.g. "прошедшее
  время · рассказ от первого лица").

Produce a genuinely diverse batch: vary topics AND countries/regions across the requested count rather
than repeating the same pairing, and never invent an idea that duplicates one already in the existing-
subjects list in spirit (even under a different slug).

Output strictly the JSON object per the schema — no prose outside it.`;
}

function buildUserPrompt(
  request: CardGenerationRequest,
  topicLabels: Record<string, string>,
  countryLabels: Record<string, string>,
): string {
  const topics = request.enabledTopicIds.map((id) => `${id} (${topicLabels[id] ?? id})`).join(', ');
  const countries = request.enabledCountryOrRegionIds.map((id) => `${id} (${countryLabels[id] ?? id})`).join(', ');
  return `Desired candidate count: ${request.desiredCount}
Enabled topic ids: ${topics}
Enabled country/region ids: ${countries}
Existing subject keys (do not duplicate): ${request.existingSubjectKeys.length ? request.existingSubjectKeys.join(', ') : '(none yet)'}`;
}

export async function generateCardCandidates(
  request: CardGenerationRequest,
  topicLabels: Record<string, string>,
  countryLabels: Record<string, string>,
  apiKey: string,
  model: string,
): Promise<GeneratedCardCandidate[]> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt(request, topicLabels, countryLabels) },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'card_candidates', strict: true, schema: CANDIDATE_SCHEMA } },
      temperature: 0.9,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  const parsed = JSON.parse(json.choices[0].message.content) as { candidates: GeneratedCardCandidate[] };
  return parsed.candidates;
}
