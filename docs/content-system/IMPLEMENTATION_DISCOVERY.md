# IMPLEMENTATION_DISCOVERY — фактическое состояние репозитория перед Content System v1.2

Дата: 2026-07-23. Ветка: `content-system-docs-v1.2`. Это Phase 0 discovery-документ,
требуемый `docs/content-system-v1.2/11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md` —
описывает то, что реально есть в коде, до какого бы то ни было изменения кода.
Никакой код в рамках этой задачи не менялся.

## 1. Структура `src/`

```text
src/
  App.tsx                — единственный роутер верхнего уровня (см. §6)
  main.tsx                — точка входа Vite/React
  index.css, styles/      — глобальные стили
  components/
    LibraryPage.tsx        — экран библиотеки (см. §7)
    GenerateLessonPage.tsx  — форма генерации урока (тема/текст, язык, уровень, TTS-провайдер)
    GenerationProgress.tsx  — индикатор стадий генерации (text → audio → align → saving)
    ReaderPage.tsx          — экран чтения: заголовок, метаданные, NarrationPlayer, текст
    ArticleContent.tsx      — рендер параграфов/предложений статьи
    InteractiveSentence.tsx — рендер одного предложения, кликабельные токены
    InteractiveToken.tsx    — один токен (слово/пунктуация), karaoke-подсветка
    ExplanationSheet.tsx    — Bottom Sheet: объяснение слова/фразы (summary + details)
    NarrationPlayer.tsx     — sticky-панель воспроизведения озвучки
    ReaderHeader.tsx        — шапка ридера (назад, метаданные, настройки)
    SettingsMenu.tsx        — тема/размер шрифта/режим перевода
    SpeedControl.tsx        — регулятор скорости воспроизведения
  hooks/                  — см. §5
  services/
    generation/
      lessonsApi.ts             — тонкие fetch-обёртки над /api/*
      generateLessonPipeline.ts — клиентская оркестрация пайплайна генерации
    narration/
      NarrationAdapter.ts       — интерфейс TTS/воспроизведения
      BrowserSpeechAdapter.ts   — Web Speech API adapter (запасной, не используется в продакшене)
      PrecomputedAudioAdapter.ts — production-путь: mp3 + word-level timestamps
  types/
    lesson.ts  — контракт Lesson/Paragraph/Sentence/Token/Annotation (см. §2)
    reader.ts  — ReaderTheme, ArticleFontSize, PlaybackStatus и т.п. UI-типы
  data/
    sampleLesson.ts        — единственный вручную написанный fixture-урок (French A2–B1)
    lessonTimestamps.json  — тайминги для sampleLesson
  lib/
    lessonText.ts — сборка сплошного текста урока + TokenSpan[], поиск токена по id/тексту
```

Вне `src/`, но части того же пайплайна:

```text
api/                — Vercel serverless-функции (см. §3)
lib/pipeline/        — серверный/детерминированный код пайплайна (используется и из api/*, и из тестов)
  languageConfig.ts       — LanguageConfig / LANGUAGE_CONFIGS (см. §8)
  tokenize.ts             — Intl.Segmenter-токенизация
  generateText.ts         — генерация/адаптация текста (шаг 1)
  generateAnnotations.ts  — генерация аннотаций тир 1/тир 2 (шаг 5, см. §9)
  generateAudio.ts        — OpenAI TTS + Whisper-транскрипция
  elevenLabsAudio.ts       — ElevenLabs TTS (+with-timestamps)
  audioProviders.ts        — общий слой: finalizeAlignment, evaluateQualityGate, generateAndAlignElevenLabs
  mapCharactersToTokens.ts, timingRecovery.ts, alignmentReport.ts — recovery-слой и quality gate
  translateSentence.ts    — перевод одного предложения
  __tests__/              — vitest на детерминированные части (tokenize, alignment, recovery, annotations)
evals/audio-alignment/ — offline eval для качества выравнивания озвучки
scripts/                — вспомогательные CLI-скрипты (генерация сэмплов голоса, аудит аннотаций и т.п.)
```

Никакого `src/content/`, `src/repositories/`, `src/domain/` или подобного в проекте
пока нет — это то, что появится в рамках новой системы.

## 2. Контракт `Lesson` (`src/types/lesson.ts`)

Прочитан напрямую из файла, полностью совпадает с тем, что было в задаче:

```ts
export type AudioProvider = 'openai' | 'elevenlabs';

export type Lesson = {
  id: string;
  language: string;            // human-readable, напр. "French" — promptLanguageName
  sourceLanguage: string;      // язык подсказок пользователя, сейчас всегда 'Russian'
  level: string;               // CEFR как свободная строка, не enum
  title: string;
  translatedTitle?: string;
  estimatedMinutes: number;
  coverImage?: string;         // объявлено в типе, нигде не заполняется и не используется в UI
  paragraphs: Paragraph[];
  annotations: Annotation[];
  audioProvider?: AudioProvider;   // отсутствует у уроков до появления выбора провайдера → трактуется как 'openai'
  languageCode?: string;           // свободная строка, а не LanguageCode — по построению один из 'fr'|'de'|'en'|'el'
  alignmentReport?: AlignmentReport;
};

export type Paragraph = { id: string; sentences: Sentence[] };

export type Sentence = {
  id: string;
  text: string;
  tokens: Token[];
  translation?: string;   // есть заранее у sampleLesson, у сгенерированных — лениво по /api/translate-sentence
};

export type Token = {
  id: string;
  text: string;
  normalized: string;
  type: 'word' | 'punctuation';
  sentenceId: string;
  startTime?: number;
  endTime?: number;
};

export type AnnotationHint = { label: string; source: string; translation: string };

export type AnnotationSummary = {
  partOfSpeech: string | null;
  displayForm: string;
  translation: string;
  audioText: string;
  hint: AnnotationHint | null;
  context: {
    source: string; translation: string;
    selectedSource: string; selectedTranslation: string;
    relatedSource?: string | null; relatedTranslation?: string | null;
  };
};

export type DetailSection =
  | { type: 'explanation'; title: string | null; body: string }
  | { type: 'table'; title: string | null; rows: string[][]; note: string | null }
  | { type: 'bilingualPairs'; title: string | null; pairs: { source: string; translation: string; note: string | null }[] }
  | { type: 'grammarNote'; body: string };

export type Annotation = {
  id: string;                 // === token.id, напрямую, без составных id
  summary: AnnotationSummary;
  details?: { sections: DetailSection[] };  // undefined до клика «Подробнее»
};
```

Важно для будущего `LessonBlueprint`/`LessonArtifactRepository`: `Lesson` не содержит
`cardId`, `blueprintId`, `userId` или любого другого поля, связывающего урок с новой
системой — это придётся добавлять как опциональные поля (не ломая существующие
сохранённые уроки в Blob, которые этих полей не имеют).

## 3. API-роуты (`api/*.ts`) — все Vercel serverless функции, `export async function GET/POST`

| Файл | Метод | Вход | Выход | Внешние зависимости |
|---|---|---|---|---|
| `api/generate-text.ts` | POST | `{ input: InputSource, level, words, sourceLanguage?, language? }` | `GeneratedText` (JSON, шаг 1 пайплайна) | OpenAI (`OPENAI_API_KEY`, модель `OPENAI_TEXT_MODEL` или `gpt-4o`) |
| `api/generate-annotation.ts` | POST | `{ target: {tokenId, sentence}, level, sourceLanguage?, tier?: 'basic'\|'details', language? }` | `AnnotationSummary` (tier=basic) либо `{ sections: DetailSection[] }` (tier=details) | OpenAI, тот же ключ/модель |
| `api/translate-sentence.ts` | POST | `{ sentenceText, level?, sourceLanguage?, language? }` | `{ translation: string }` | OpenAI |
| `api/generate-audio.ts` | POST | `{ text, slug, provider?, language?, spans?, wordTokens? }` | `{ audioUrl }` (openai) либо `{ audioUrl, timestampsByToken, report }` (elevenlabs) | OpenAI TTS (`OPENAI_API_KEY`) или ElevenLabs (`ELEVENLABS_API_KEY`) + запись mp3 в Vercel Blob (`@vercel/blob` `put`) |
| `api/align-audio.ts` | POST | `{ audioUrl, wordTokens, language? }` | `{ ...aligned }` (timestampsByToken/report) либо `422 { error, report }` при непройденном quality gate | OpenAI Whisper (тот же `OPENAI_API_KEY`); только для provider='openai' — ElevenLabs делает это внутри `generate-audio.ts`. Есть SSRF-минимизация: `audioUrl` обязан быть на `*.public.blob.vercel-storage.com` |
| `api/speak-unit.ts` | POST | `{ text, language?, provider? }` (макс. 80 символов) | `{ audioUrl, audioBase64? }` | OpenAI TTS или ElevenLabs + Blob-кэш по `sha256(provider|language|voiceId|modelId|speed|text)` под `clips/{provider}/{language}/{hash}.mp3`; `list()` перед генерацией — попадание в кэш не делает AI-вызов |
| `api/save-lesson.ts` | POST | `{ lesson: Lesson, audioUrl: string }` | `{ slug, lessonUrl }` | Vercel Blob: пишет `lessons/{slug}.json` и переписывает `lessons/index.json` целиком (см. §4) |
| `api/lessons.ts` | GET | — | `LessonIndexEntry[]` (или `[]` при отсутствии индекса/ошибке чтения) | Vercel Blob `list()`+`fetch()` по `lessons/index.json` |

Все ключи (`OPENAI_API_KEY`, `ELEVENLABS_API_KEY`) читаются только на сервере из
`process.env` — ни один не попадает в клиентский код. Ни у одного роута нет
auth/авторизации, rate limiting или понятия "пользователь" — это открытое
(и осознанно отложенное, см. `PROGRESS.md`) security-замечание, актуальное и для новой
системы: любой из будущих `/api/app-preferences`, `/api/feed` и т.п. будет так же не
авторизован, если явно не добавить это в новой системе.

## 4. `src/services/generation/lessonsApi.ts` и `generateLessonPipeline.ts`

`lessonsApi.ts` — тонкий слой `postJson<T>()` поверх `fetch`, по одной функции на
каждый `/api/*`-роут (`fetchGeneratedText`, `fetchAnnotationBasic/Details`,
`fetchSentenceTranslation`, `fetchGeneratedAudio`, `fetchAudioAlignment`,
`fetchUnitClip`, `saveLesson`, `fetchLessonsIndex`). Ошибки quality gate (HTTP 422 с
`{error, report}`) распознаются и превращаются в человекочитаемое сообщение.

`generateLessonPipeline.ts` — вся оркестрация на клиенте (браузер сам пошагово дёргает
короткие serverless-эндпоинты, не единый долгий job на сервере):

1. `fetchGeneratedText` → сырой текст по параграфам.
2. Детерминированная токенизация (`tokenizeParagraphs`, `Intl.Segmenter` по `bcp47` языка) — без AI-вызова.
3. Собирается `Lesson` без аннотаций (`annotations: []` — аннотации не генерируются заранее, только лениво по клику, см. §9) и без таймингов.
4. `fetchGeneratedAudio` — TTS. Для `elevenlabs` тайминги приходят тем же ответом; для `openai` дополнительно `fetchAudioAlignment` (отдельный Whisper-проход).
5. Тайминги проставляются на токены (`startTime`/`endTime`), формируется финальный `Lesson` с `alignmentReport`.
6. `saveLesson(finalLesson, audioUrl)` → `POST /api/save-lesson`.

Это и есть текущий "generation + persistence" flow, который должен стать основой
для будущего `LessonArtifactRepository` adapter: сохранение (`saveLesson`) и чтение
списка (`fetchLessonsIndex`) уже инкапсулированы в отдельном модуле, но напрямую
работают с конкретными `/api/*` эндпоинтами, а не через интерфейс репозитория —
интерфейса `LessonArtifactRepository` в коде сейчас нет вообще, это предстоит ввести.

## 5. `src/services/narration/*` — паттерн-образец для будущих repository-интерфейсов

`NarrationAdapter.ts` — чистый TS-интерфейс, ничего не знает о React:

```ts
export interface NarrationAdapter {
  playFrom(tokenId: string, rate: number): void;
  pause(): void;
  stop(): void;
  speakSelection(text: string, rate?: number, onError?: (error: Error) => void, contextText?: string): void;
  setRate(rate: number): void;
  onTokenChange(callback: (tokenId: string) => void): void;
  onComplete(callback: () => void): void;
  onError(callback: (error: Error) => void): void;
}
```

Две реализации: `BrowserSpeechAdapter` (Web Speech API, ранний прототип, ещё в
кодовой базе как рабочий запасной вариант, не используется по умолчанию) и
`PrecomputedAudioAdapter` (production-путь — проигрывает готовый mp3 и синхронизирует
karaoke-подсветку по заранее посчитанным `TimedSpan[]`). `useNarration.ts`
инстанцирует конкретный adapter (`new PrecomputedAudioAdapter(...)`) и отдаёт React
только методы интерфейса — компоненты ридера НЕ знают, что это mp3-файл, а не
Web Speech API. Это ровно та модель, которую пакет `docs/content-system-v1.2`
предлагает повторить для `AppPreferencesRepository`, `ContentCardRepository` и т.д.:
интерфейс отдельно, конкретные adapters (Blob/localStorage/seed JSON) — отдельно,
UI зависит только от интерфейса.

## 6. Хуки `src/hooks/*`

| Хук | Что делает | localStorage |
|---|---|---|
| `useNarration.ts` | Инстанцирует `PrecomputedAudioAdapter`, отдаёт `playbackStatus`, `activeTokenId`, `rate`, `play/pause/stop/setRate/inspectToken/continueFrom/replay/speakSelection` | нет |
| `useReaderPreferences.ts` | Тема (light/dark, дефолт — системная), размер шрифта, `translationMode` (глобальный булев тумблер) | ключ `context-reader:preferences`, JSON `{theme, fontSize, translationMode}` |
| `useSavedUnits.ts` | Стаб «сохранить слово/фразу» — плоский список `SavedUnit{lessonId, tokenId, displayText, shortTranslation, savedAt}`, toggle по паре `(lessonId, tokenId)` | ключ `context-reader:saved`, JSON `SavedUnit[]` |
| `useSelectedAnnotation.ts` | Резолвит, что показывать в Bottom Sheet по `tokenId`; ленивая загрузка тир 1 (basic) сразу при выборе токена, тир 2 (details) — по явному "Подробнее"; кэш только в памяти (сессионный `useState`, не пишется обратно в Blob) | нет |
| `useSentenceTranslations.ts` | Догружает перевод предложений в режиме перевода, `mapWithConcurrency` с лимитом 3; фактическое поведение — переводятся ВСЕ предложения урока сразу при включении режима, не только видимые (расхождение с комментарием в коде, зафиксировано также в `docs/content-system-v1.2/_existing_project_context/01_product_learning_ux.md`, §7) | нет (сессионный кэш в `useState`) |
| `useUnitPronunciation.ts` | Клип произношения слова/формы в Bottom Sheet через `/api/speak-unit`, клиентский кэш промисов по тексту, воспроизведение из `audioBase64` на промахе кэша | нет |

Итог по `grep -rn "localStorage" src/`: ровно два реальных ключа во всём проекте —
`context-reader:preferences` и `context-reader:saved`. Никакого общего префикса
`context-reader:v1:...`, который предлагает `15_STORAGE_OPTIONS_AND_DATABASE_MIGRATION_PLAN.md`
(§4), в реальном коде пока нет — существующие ключи не версионированы (`v1` в имени
отсутствует).

## 7. `src/App.tsx` — текущая навигация верхнего уровня

Один компонент, один `useState<View>`, без роутера (`react-router` не подключён):

```ts
type View =
  | { kind: 'library' }
  | { kind: 'generate' }
  | { kind: 'reader'; lesson: Lesson; audioSrc: string };
```

- `library` (дефолт) → `<LibraryPage onOpenSample onOpenGenerated onGenerateNew>`.
- `generate` → `<GenerateLessonPage onBack onGenerated>`; после успешной генерации сразу переключается в `reader` с полученным `Lesson`.
- `reader` → `<ReaderPage lesson audioSrc onBack>`; `onBack` возвращает в `library`.
- Есть отдельное состояние `loadError` для ошибки загрузки конкретного сгенерированного урока по клику из библиотеки (fetch `entry.lessonUrl` может упасть).

Нет никакого layout-уровня выше этого (`<>...</>` без общей обёртки), нет bottom
nav, нет глобального языка/уровня в состоянии приложения — сейчас язык/уровень
выбираются заново на каждом экране генерации и не хранятся как "текущий язык
пользователя". Новая mobile shell (`Выбрать`/`Мои тексты`/`Учить`, единый глобальный
`activeLanguage`) должна встраиваться поверх/вместо этого `View`-стейта: скорее всего
`reader` останется отдельным полноэкранным состоянием "поверх" таб-навигации (как и
описано в `16_APPROVED_MOBILE_UX_AND_NAVIGATION.md` — "Reader открывается отдельно"),
а `library`/`generate` естественно переезжают под вкладки `Мои тексты`/генерацию из
карточки.

## 8. `src/components/LibraryPage.tsx`

Простой плоский список без языковой фильтрации: одна hardcoded карточка `sampleLesson`
(всегда первая, всегда французская) + `entries` из `fetchLessonsIndex()` (все языки
вперемешку, без группировки/фильтра по языку). `entryLanguageName()` резолвит
`entry.languageCode` через `LANGUAGE_CONFIGS`, с фолбэком на `'French'`, если код
неизвестен/отсутствует — специально не через бросающий `getLanguageConfig`, чтобы одна
странная запись в индексе не уронила всю библиотеку. Состояния: `entries === null`
(загрузка), `failed` (ошибка сети, с кнопкой "Повторить"), пустой список ("уроков пока
нет"). Заголовок жёстко "Интерактивные тексты для чтения на французском" — не
языко-нейтрален, несмотря на то что показывает уроки на всех 4 языках.

Для новой language-scoped библиотеки (`Мои тексты`, фильтр по `activeLanguage`,
`Continue` по `lastOpenedAt DESC`, как того требует `11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md`/
`06_DATA_MODEL_AND_STORAGE.md` §13) этот компонент, скорее всего, придётся
переписать/расширить, а не просто обернуть — сейчас нет ни language-фильтра, ни
`lastOpenedAt` (такого поля нет ни в `Lesson`, ни в `LessonIndexEntry`), ни read/started
статусов.

## 9. Мультиязычность — `LanguageConfig`

Файл: `lib/pipeline/languageConfig.ts` (НЕ в `src/`, а в серверном/общем `lib/pipeline/`,
используется и из `api/*.ts`, и из `src/services/generation/*`, и из хуков).

```ts
export type LanguageCode = 'fr' | 'de' | 'en' | 'el';
export type LanguageConfig = {
  code: LanguageCode;
  displayName: string;          // "Французский" и т.п., для UI-селектора
  promptLanguageName: string;   // "French" — как называть язык в промптах
  bcp47: string;                // 'fr-FR' — для Intl.Segmenter
  whisperLanguageCode: string;  // ISO 639-1 для Whisper
  voices: VoiceConfig;          // openaiVoice, elevenLabsVoiceId/ModelId/ClipModelId/Speed
  voiceVerified: boolean;       // проверен ли голос на слух человеком
};
export const LANGUAGE_CONFIGS: Record<LanguageCode, LanguageConfig> = { fr, de, en, el };
export function getLanguageConfig(code): LanguageConfig  // бросает на неизвестном коде
export function listLanguageConfigs(): LanguageConfig[]
```

Только `fr` помечен `voiceVerified: true`; `de`/`en`/`el` используют тот же голос
ElevenLabs, что и французский (мультиязычная модель технически говорит на всех
четырёх), но качество не проверено на слух — совпадает с целевыми языками из
`00_README_IMPLEMENTATION_ORDER.md` (немецкий/французский/греческий/английский).
Это единственное место в коде, которое можно назвать "language registry" — отдельного
файла с именем `LanguageConfig.ts` в `src/` нет, вся конфигурация лежит в
`lib/pipeline/languageConfig.ts`. Новой системе (feed/library/learn per-language)
логично переиспользовать этот же реестр как источник списка поддерживаемых языков,
а не заводить второй.

## 10. Расхождение с `07_AI_CONTENT_GENERATION_PIPELINE.md`: markPhrases не существует

Пакет `docs/content-system-v1.2/07_AI_CONTENT_GENERATION_PIPELINE.md` (в порядке
чтения документов — шаг генерации, где предполагается этап "phrase group
annotation"/группировка токенов в фразы перед аннотированием) описывает пайплайн,
который у соответствующего шага уже не существует в реальном коде.

Факт из кода: `grep -ri "markphrase"` по всему репозиторию находит упоминания только
как **историческую** ссылку — в комментариях `src/types/lesson.ts`,
`src/components/InteractiveSentence.tsx`, `lib/pipeline/generateAnnotations.ts` и в
`PROGRESS.md`/`AI_PIPELINE.md`. Самого `markPhrases.ts` и `api/mark-phrases.ts` в
дереве репозитория нет — они были удалены целиком (см. `PROGRESS.md`, запись от
2026-07-22, "Bottom Sheet v2 — per-token клик"): предыдущая архитектура заранее
группировала токены в фразы отдельным AI-шагом при генерации урока (шаг 4), из-за
чего клик по слову внутри многословной фразы открывал объяснение на всю фразу — это
было признано архитектурной проблемой, не багом конкретной разметки.

Что происходит вместо этого по факту:

- Генерация урока (`generateLessonPipeline.ts`) вообще не вызывает AI для аннотаций
  и не строит группировку токенов — только текст → детерминированная токенизация →
  аудио. `Lesson.annotations` при создании всегда `[]`.
- Каждый word-токен кликабелен независимо и всегда; `Annotation.id === token.id`
  напрямую, без составных id вида `"gen-t71-t72-t73"`.
- Аннотация генерируется лениво, по клику, в два тира через ОДИН и тот же эндпоинт
  `api/generate-annotation.ts` (`tier: 'basic' | 'details'`, см. §3, §9) —
  `lib/pipeline/generateAnnotations.ts` экспортирует `generateAnnotationBasic` и
  `generateAnnotationDetails`.
- "Связанная фраза" (напр. `στον` → `στον σταθμό`) не меняет цель клика — это
  подсказка ВНУТРИ объяснения выбранного токена (`AnnotationSummary.hint`,
  `context.relatedSource`/`relatedTranslation`), решается заново при каждом клике на
  основе `isValidRelatedSpan()` (перенесённая из старого `markPhrases.ts` проверка
  `isConsecutiveWordSpan`, теперь живёт в `generateAnnotations.ts`), не сохраняется
  заранее в урок.
- `ExplanationSheet.tsx` рендерит `details.sections: DetailSection[]` — типизированный,
  но не фиксированный набор секций (только те, что реально применимы к конкретному
  слову), а не фиксированную схему карточек.

Практическое следствие для новой системы: если `07_AI_CONTENT_GENERATION_PIPELINE.md`
где-либо описывает шаг генерации карточки/урока, который зависит от заранее
собранных phrase groups (например, для оценки сложности материала или для будущих
`LearningNode` на уровне многословных конструкций), этот вход придётся пересчитывать
по-другому — из per-token аннотаций и/или отдельным новым анализом текста, а не
переиспользовать несуществующий артефакт старого пайплайна.

## 11. Другие расхождения между `_existing_project_context/*.md` и реальным кодом

Пакет `docs/content-system-v1.2/_existing_project_context/PRODUCT_OVERVIEW.md` и
`01_product_learning_ux.md` в целом точно описывают продукт (оба документа явно
опираются на актуальные `PLAN.md`/`AI_PIPELINE.md`/`PROGRESS.md` и по факту описывают
уже свершившийся переход на Bottom Sheet v2 per-token — расхождений по архитектуре
Bottom Sheet с реальным кодом не найдено, `01_product_learning_ux.md` §6 прямо
сравнивает с "текущей моделью", которая в коде уже per-token, а не с устаревшей
markPhrases-версией). Тем не менее при сверке с реальным кодом нашлись более мелкие
неточности/уточнения:

1. **`01_product_learning_ux.md` §6 описывает markPhrases как всё ещё текущую
   модель** ("Текущая модель заранее помечает phrase groups во время генерации
   урока... Не нужно при каждом клике заново просить AI «расширить выделение»").
   Это устарело относительно реального кода на момент данного discovery
   (2026-07-23): группировки во время генерации больше нет (см. §10 выше),
   "расширение" уже решается по клику через `isValidRelatedSpan`/hint-механизм,
   просто без отдельного пре-пасса на этапе генерации. Раздел годится как
   продуктовое обоснование ("не спрашивать AI заново на каждый клик"), но
   технически описывает уже не действующую архитектуру.
2. **`PRODUCT_OVERVIEW.md` §7 "что сейчас в работе" описывает Bottom Sheet-редизайн
   как незавершённый и "аудио v2 только что реализовано"** — на момент этого
   discovery `PROGRESS.md` фиксирует, что Bottom Sheet v2 (per-token) уже
   реализован, живой API-вызов проверен, но именно рендер `ExplanationSheet.tsx`
   в браузере на момент последней записи `PROGRESS.md` **не был визуально
   проверен человеком** ("не проверено мной — ручной клик в браузере"). Это не
   противоречие, а просто более старый снимок состояния (`PRODUCT_OVERVIEW.md`
   не датирован явно как "актуален на", в отличие от `01_product_learning_ux.md`,
   у которого явно стоит "Актуален на 2026-07-22").
3. **`coverImage?: string` в `Lesson`** упомянут в типе, но не используется нигде в
   компонентах (не рендерится в `LibraryPage.tsx`, не заполняется в
   `generateLessonPipeline.ts`) — если новая система планирует показывать обложки в
   карточках Feed/Library, этого поля сейчас просто нет в реальном UI-слое, только
   в типе.
4. Ни в `PROGRESS.md`, ни в `AI_PIPELINE.md`, ни в `PLAN.md`/`DESIGN.md` нет упоминаний
   каких-либо "cards", "feed", "learning plan" — это ожидаемо (документы описывают
   уже существующий reader), но подтверждает, что вся концептуальная модель
   Content System v1.2 (ContentCard/FeedBatch/LearningNode/AppPreferences/
   LanguageProfile) целиком новая для этого репозитория: ни единого именования или
   заготовки под неё в существующем коде не найдено.
5. Явного "экрана Bottom Sheet handoff" каталога в момент discovery в дереве —
   `greek-bottom-sheet-handoff/`, упомянутый в `PROGRESS.md` — не проверялся отдельно
   в рамках этой задачи (не требовался инструкцией), но подтверждён по ссылкам в
   `PROGRESS.md` как реально существующий источник дизайн-решений Bottom Sheet v2.
