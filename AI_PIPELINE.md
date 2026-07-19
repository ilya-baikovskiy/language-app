# AI-пайплайн — черновик архитектуры и шаблонов

Дополняет `PLAN.md`/`DESIGN.md`. Ничего из этого файла ещё не реализовано в
приложении — это фиксация решений, принятых в обсуждении, чтобы не потерять
их до момента реализации (после Этапа 5, по явному сигналу пользователя).

## Статус решений

| Вопрос | Решение |
|---|---|
| TTS-провайдер | Сравниваем ElevenLabs и OpenAI TTS на одном отрывке (`scripts/generate-audio-sample.mjs`), решаем на слух |
| Архитектура TTS | Прекомпилируем аудио + таймкоды одним локальным скриптом (не runtime-backend) для текущего фиксированного урока; `PrecomputedAudioAdapter` в рантайме просто проигрывает готовый файл |
| Backend для генерации новых уроков | Vercel serverless function, ключ — серверная env-переменная, никогда не уходит в браузер |
| Контекст для генерации Bottom Sheet | Полное предложение, а не пара соседних слов — иначе не хватает смысла для объяснения выбора времени (imparfait/passé composé) и похожих грамматических развилок |
| UI пошаговой генерации урока (материал → настройки → результат) | Сначала статический UI (по аналогии с Этапом 1 самого ридера), реальная генерация подключается после того, как определимся с провайдером текста/разметки |

## Шаблон генерации аннотации (Bottom Sheet)

Вызывается один раз на клик по слову/фразе (в будущем — один раз при подготовке
урока для всех содержательных единиц сразу, не на каждый клик пользователя).

**System prompt:**

```
You are a French-language teaching assistant embedded in a reading app.
A learner (Russian-speaking, CEFR level {level}) clicked on a word or
phrase while reading. Explain it the way a good teacher would in a short,
live aside — not a dictionary entry.

Rules:
- All explanatory text (contextualMeaning, grammarSummary, grammarDetails,
  constructionExplanation, otherMeanings[].note) must be written in
  Russian, natural and concise.
- shortTranslation is a short Russian gloss (a few words), not a full
  sentence.
- lemma, displayText, pronunciation, partOfSpeech, grammarLabel and
  examples[].targetText stay in French (examples[].translation is
  Russian).
- contextualMeaning must explain the MEANING IN THIS SPECIFIC SENTENCE
  first — never open with a generic dictionary definition.
- If the target spans multiple tokens (a fixed phrase, a verb+preposition
  construction, a reflexive verb with its auxiliary), keep them together
  and explain as one unit — do not explain sub-parts separately.
- grammarSummary: 1–2 sentences, plain language, no textbook jargon.
- grammarDetails (only if there's a genuinely useful deeper point — tense
  contrast, an irregular form, a common learner mistake): 2–4 sentences
  max.
- Provide exactly 2 examples: short, natural French sentences roughly at
  the learner's level, using the same word/construction, each with a
  Russian translation.
- Never invent grammar that isn't true. If unsure, omit grammarDetails
  rather than guess.
- Output strictly the JSON object per the provided schema — no prose
  outside it.
```

**User prompt (на каждую единицу):**

```
Language: French
Learner level: {level}                 // напр. "A2–B1"
Full sentence: "{sentenceText}"
Target span in the sentence: "{targetText}"   // точная подстрока клика
Token type: {"word" | "phrase"}
```

**Схема ответа** — один в один поля `Annotation` из `src/types/lesson.ts`,
кроме `id`/`type`/`tokenIds` (их присваивает приложение, а не AI — оно уже
знает, какие токены кликнули и слово это или фраза):

```json
{
  "displayText": "string",
  "lemma": "string",
  "pronunciation": "string | null",
  "partOfSpeech": "string | null",
  "grammarLabel": "string | null",
  "shortTranslation": "string",
  "contextualMeaning": "string",
  "constructionExplanation": "string | null",
  "grammarSummary": "string | null",
  "grammarDetails": "string | null",
  "otherMeanings": [{ "translation": "string", "note": "string | null" }],
  "examples": [{ "targetText": "string", "translation": "string" }]
}
```

Реализация — через structured output (`response_format: json_schema` у
OpenAI, tool-use у Claude и т.п.), чтобы не парсить свободный текст.

## Открытые вопросы (обсудить перед реализацией)

- Какой AI-провайдер для текста/грамматики (может отличаться от TTS-провайдера).
- Генерировать аннотации на лету при клике, или заранее для всех
  содержательных слов при подготовке урока (склоняюсь ко второму — дешевле,
  быстрее для пользователя, легче проверить качество один раз).
- Как определять, какие слова/фразы вообще достойны аннотации (сейчас это
  делает человек вручную) — отдельный AI-шаг разметки константных
  конструкций до генерации объяснений.
