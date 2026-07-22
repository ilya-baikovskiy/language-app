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

## Озвучка v2 — тайминги, recovery-слой, quality gate, мультиязычность

В отличие от остального файла, это **реализовано и работает**, не черновик.
Записано по итогам сессии 2026-07-22 — сравнение OpenAI+Whisper vs ElevenLabs
на живой генерации выявило конкретные баги в старом пути (см. ниже), и вместо
точечного патча решение переработано целиком.

### Три архитектуры получения word-level таймингов (индустриальный ресёрч)

1. **Пост-анализ готового аудио** — TTS ничего не знает о времени, отдельный
   ASR-движок (Whisper) слушает результат и угадывает соответствие словам.
   Самый слабый вариант: у OpenAI TTS в принципе нет собственных таймингов,
   поэтому наш старый (и всё ещё существующий, как fallback) путь —
   именно это, с ручной эвристикой сопоставления слов (`alignTokensToWhisper`
   в `lib/pipeline/generateAudio.ts`).
2. **Отдельный forced-alignment проход** — текст заранее известен, отдельный
   вызов привязывает его к готовому аудио посимвольно (`POST /v1/forced-alignment`
   у ElevenLabs). Точнее, чем (1), но всё ещё второй HTTP round-trip с
   повторной загрузкой аудио.
3. **Тайминги как побочный продукт синтеза** — TTS-движок сам знает, что
   говорит, и отдаёт тайминги в том же вызове (Amazon Polly speech marks;
   у ElevenLabs — `POST /v1/text-to-speech/{voice}/with-timestamps`). Это и
   есть выбранный путь для ElevenLabs — один вызов вместо двух, тайминги не
   пост-анализ, а часть генерации.

`lib/pipeline/elevenLabsAudio.ts` реализует (3) как основной прод-путь
(`generateLessonAudioElevenLabs`) и сохраняет (2) отдельно
(`getForcedAlignment`) только для `evals/audio-alignment` — там сознательно
нужно выровнять ОДНО И ТО ЖЕ аудио (сгенерированное OpenAI) двумя способами,
чтобы сравнить именно выравнивание, а не голос+выравнивание вместе.

### Найденные баги и их причина

- **«découvrir» звучал как «couvrir»** — `mapCharactersToTokens` резал
  границу токена по первому/последнему ВАЛИДНОМУ символу внутри его
  собственного диапазона; если ведущие символы («d», «é» — типично на
  лиэзонах) получали от ElevenLabs невалидный тайминг, они молча терялись.
  **Фикс (edge-snap)**: если внутри токена есть и валидные, и невалидные
  символы, граница расширяется НАРУЖУ — до конца/начала ближайшего валидного
  символа соседнего токена/пробела, а не режется по первому валидному внутри
  слова.
- **«pour» не подсвечивался при чтении** — если ВСЕ символы токена невалидны,
  он уходил в `unmapped`, и клиентский пайплайн (`generateLessonPipeline.ts`)
  это поле просто отбрасывал — токен навсегда оставался без таймкода.
  **Фикс**: `lib/pipeline/timingRecovery.ts` — универсальный (провайдеро-
  независимый) recovery-слой поверх сырых таймингов: полностью пропущенные
  токены интерполируются между ближайшими размеченными соседями
  пропорционально длине текста; нулевые/микро-длительности (класс проблем
  Whisper — короткие служебные слова) растягиваются в паузу до следующего
  слова; нарушения монотонности клампятся.

### Quality gate

`lib/pipeline/alignmentReport.ts` — после любого провайдера (+recovery-слоя)
считается `AlignmentReport`: сколько слов получили тайминг НАПРЯМУЮ от
провайдера vs скольким потребовалось восстановление (`edge`/`interpolated`/
`stretched`/`clamped`/`guessed`), покрытие, нарушения монотонности. Пороги
(`evaluateQualityGate`): прямое покрытие < 95% или доля восстановленных > 10%
→ урок НЕ сохраняется, пользователь видит причину текстом (было: `unmatched`
молча выбрасывался, урок сохранялся вслепую — реальный баг, найденный
внешним аудитом кода в этой же сессии). Пороги — первое приближение,
калиброванное на глаз, не на статистике реальных прогонов; ожидаемо
потребуют пересмотра по мере накопления данных (см. `report.recovered` —
он сохраняется вместе с уроком в `Lesson.alignmentReport`, так что материал
для калибровки будет).

### Клипы слов вместо нарезки дорожки (Bottom Sheet)

Озвучка отдельного слова/фразы по клику раньше была нарезкой общей дорожки
урока (`speakSelection` в `PrecomputedAudioAdapter`) — она и давала
«découvrir» на слух как обрубок, и в принципе не работала для текста,
которого в уроке нет дословно (формы слов, разбор фразы по частям — там
раньше была кнопка-заглушка с тостом «будет добавлено позже»). Теперь
`api/speak-unit.ts` генерирует отдельный короткий клип (`generateSpeech`/
`generateSpeechElevenLabs`, **тем же провайдером и голосом, что и весь
урок** — иначе слово прозвучит другим голосом), кэшируется в Blob по хэшу
`provider|lang|voice|speed|text`. Работает для ЛЮБОГО текста — сняло разом
и баг с коартикуляцией, и старую заглушку. Предложение целиком по-прежнему
озвучивается нарезкой дорожки (`onSpeak`) — там коартикуляция уместна.

### Мультиязычность — контракт готов, голоса de/en/el не проверены на слух

`LanguageCode = 'fr' | 'de' | 'en' | 'el'`, `LanguageConfig.voices` —
раздельные настройки под OpenAI и ElevenLabs на язык. Разбиение на
предложения (`tokenize.ts`) — через `Intl.Segmenter(bcp47, {granularity:
'sentence'})` вместо общего регэкспа (был источник ошибок на сокращениях/
кавычках/строчных начале предложения). Все 8 мест с захардкоженным
`getLanguageConfig('fr')` в `api/*.ts` теперь читают `language` из тела
запроса. **Важная оговорка**: голоса для de/en/el — временно те же voice_id,
что у fr (`eleven_multilingual_v2` умеет говорить на всех четырёх), **не
проверены на слух** (`LanguageConfig.voiceVerified: false`) — в UI генерации
это явно показывается предупреждением. Известное нерешённое ограничение:
греческий вопросительный знак — символ `;` (U+003B), тот же что «точка с
запятой» везде — это языковая условность, не Unicode-категория символа,
`Intl.Segmenter` её не гарантированно решает (UAX #29 не переопределяет
символ по locale).
