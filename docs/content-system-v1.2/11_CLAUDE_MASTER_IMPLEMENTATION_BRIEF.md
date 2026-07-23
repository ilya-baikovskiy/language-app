# Master implementation brief для Claude Code

## Роль

Работай как senior product engineer внутри существующего Context Reader.
Проект уже имеет reader, `Lesson` model, генерацию, TTS, Blob storage и Bottom Sheet.
Новая система должна расширить их, а не создать параллельное приложение.

## Важное уточнение о storage

У проекта **пока нет базы данных**. PostgreSQL или другой provider ещё не выбран.

Поэтому:

- не подключай базу в первом PR;
- не создавай SQL migrations по умолчанию;
- сначала изучи текущий Blob flow;
- введи repository interfaces;
- реализуй минимальные adapters для seed JSON и существующего Blob;
- подготовь отдельный Storage ADR перед durable tracking/adaptive ranking.

Основной документ: `15_STORAGE_OPTIONS_AND_DATABASE_MIGRATION_PLAN.md`.

## Обязательное чтение до кода

1. `PRODUCT_OVERVIEW.md`
2. `01_product_learning_ux.md`
3. `PLAN.md`, `DESIGN.md`, `AI_PIPELINE.md`, `PROGRESS.md`
4. Lesson types/schema
5. current API endpoints
6. LibraryPage/ReaderPage/GenerateLessonPage
7. ExplanationSheet/phrase group code
8. Blob storage and library index code
9. tests
10. весь пакет `context-reader-content-system-docs`;
11. `16_APPROVED_MOBILE_UX_AND_NAVIGATION.md`;
12. `_prototype_reference/context_reader_content_feed_prototype_v8.html` как визуальный/interaction reference.

## Цель

```text
prepared content ideas
→ five-card feed
→ user selection
→ LessonBlueprint
→ existing lesson generation pipeline
→ library + reader
→ events
→ future hidden-plan adaptation
```

## Не делать

- не переписывать reader;
- не менять TTS provider architecture в том же PR;
- не создавать full lessons для feed заранее;
- не добавлять SRS;
- не добавлять mixed-language `Все` filter в Library/Learn;
- не возвращать topic catalogue на main feed;
- не показывать target-language titles в feed/library;
- не копировать prototype v8 JavaScript как production architecture;
- не делать ML recommender;
- не превращать localStorage в долгосрочный источник истины;
- не выбирать PostgreSQL без ADR;
- не хранить тяжёлые Lesson/audio artifacts в будущем structured store;
- не менять CEFR автоматически;
- не использовать unvalidated AI JSON;
- не создавать второй Lesson format без реальной миграционной причины;
- не включать adaptive ranking на недолговечных/непроверенных событиях.

## Первый обязательный результат

До реализации создать два документа.

### `docs/content-system/IMPLEMENTATION_DISCOVERY.md`

- фактическая структура repo;
- routes;
- current Lesson type;
- library persistence;
- generation stages;
- API/job model;
- current user/auth model;
- tests;
- integration points;
- documentation/code conflicts.

### `docs/content-system/STORAGE_DISCOVERY.md`

- current Blob paths и manifests;
- как происходит update library index;
- какие writes уже есть;
- current localStorage keys;
- один или несколько пользователей;
- нужна ли cross-device synchronization;
- требования к events;
- варианты временных adapters;
- критерии будущего storage provider.

## Shared contracts

Минимум:

- `AppPreferences`;
- `LanguageProfile`;
- canonical `ContentCard`;
- `LessonBlueprint`;
- `FeedBatch`;
- `FeedItem`;
- `AnalyticsEvent`;
- `LearningNode`;
- `UserLearningNodeState`;
- опционально `GenerationJob`, если текущий flow требует persistence.

Используй существующую schema library проекта. Если её нет, предпочти Zod.

## Repository contracts

Необходимый минимум:

```ts
interface AppPreferencesRepository {}
interface LanguageProfileRepository {}
interface ContentCardRepository {}
interface FeedRepository {}
interface LessonArtifactRepository {}
interface AnalyticsEventRepository {}
```

`LearningStateRepository` добавлять, когда начинается Phase 6.

UI и domain services не должны импортировать Vercel Blob SDK.

## Первая реализация storage

### Cards

`StaticSeedCardRepository` читает versioned JSON из repo.

### Lessons

Adapter поверх существующего Blob save/list/load flow.

### App preferences и profiles

Хранить вместе или отдельными records через adapters. Выбрать после discovery минимальный вариант:

1. Blob JSON через API — предпочтительно для cross-device;
2. localStorage — допустимо только как явно временный personal prototype.

### Events

В первом PR не нужны.
В tracking PR допустим immutable batch JSON в Blob, пока отдельный ADR не выбрал durable store.

## MVP API до базы

Фактический набор адаптировать к текущему serverless routing.

```text
GET    /api/app-preferences
PATCH  /api/app-preferences
GET    /api/language-profiles
PATCH  /api/language-profiles/:language
GET    /api/feed?language=el
POST   /api/feed/refresh
POST   /api/cards/:cardId/generate
POST   /api/events/batch              (только в tracking phase)
```

`GET /api/generation-jobs/:jobId` добавлять только если generation job persistent.

## MVP feed response

```ts
interface FeedResponse {
  batchId: string;
  language: LanguageCode;
  selectedLevel: CEFRLevel;
  algorithmVersion: string;
  generatedAt: string;
  items: Array<{
    position: number;
    slot: FeedSlot;
    card: PublicContentCard;
  }>;
}
```

Не отдавай production UI внутренние scores без необходимости.

## Seed-first

Сначала вручную подготовленные cards:

- детерминированный UX;
- ranking можно тестировать;
- source discovery не блокирует релиз;
- база не нужна;
- проще понять реальные предпочтения.

AI-card generation — следующий слой.

## Начальные feature flags

```text
contentFeedEnabled=true (dev)
adaptiveRankingEnabled=false
learningStateUpdatesEnabled=false
levelTrialsEnabled=false
sourceBasedCardsEnabled=false или seed-only
eventTrackingEnabled=false до tracking phase
```

## Порядок PR

### PR 1 — discovery и storage-independent foundation

- `IMPLEMENTATION_DISCOVERY.md`;
- `STORAGE_DISCOVERY.md`;
- shared contracts;
- repository interfaces;
- seed card adapter;
- existing Lesson Blob adapter;
- language profiles с временным adapter;
- settings.

**Не подключать новую базу.**

### PR 2 — approved mobile shell + feed

- canonical seed cards;
- global active language selector;
- app preferences;
- glass bottom nav with Choose / Library / Learn;
- fixed slot composer;
- FeedPage with Russian editorial titles;
- hero without `Главная` badge;
- provenance + duration chips only;
- refresh;
- settings for levels + global topics/countries;
- language-scoped Library/Learn shells;
- mobile smoke test against prototype v8.

### PR 3 — card → Lesson

- blueprint;
- existing pipeline adapter;
- library states;
- retry/idempotency.

### PR 4 — tracking experiment

- event client;
- immutable event batch adapter или local debug export;
- reader instrumentation;
- feedback;
- debug journey.

### Architecture checkpoint

- собрать реальные данные;
- написать Storage ADR;
- выбрать или отложить durable structured store;
- не переходить к adaptive ranking без решения.

### PR 5 — durable storage, если принято

- provider adapter;
- schema/migrations;
- import scripts;
- event dedup/query;
- backup/export.

### PR 6 — learning plan

- learning maps;
- passport;
- state updater;
- adaptive ranking behind flag.

### PR 7 — sources

- source registry;
- factual card preparation;
- expiry/attribution.

## Работа с расхождениями

Если код не совпадает с документацией:

1. не угадывай;
2. зафиксируй расхождение;
3. выбери минимальное совместимое изменение;
4. обнови discovery document;
5. не ломай старые lessons;
6. попроси решения только если выбор необратим и реально блокирует.

## Команда старта

Изучи repository. Создай `IMPLEMENTATION_DISCOVERY.md` и `STORAGE_DISCOVERY.md`.
Затем реализуй только PR 1 без подключения новой базы данных.
После PR: `tsc`, lint, tests, manual mobile smoke test и docs update.

## UI implementation guardrail

При расхождении старого примера и утверждённого UX использовать `16_APPROVED_MOBILE_UX_AND_NAVIGATION.md`. В PR description перечислить намеренные отклонения от prototype v8.
