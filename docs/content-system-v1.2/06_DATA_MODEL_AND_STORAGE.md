# Логическая модель данных и стратегия хранения

## 1. Статус решения

На текущий момент у Context Reader **нет постоянной базы данных**.

Уже существует:

- Vercel Blob для `Lesson` JSON, аудио и библиотечного индекса;
- localStorage для части UI-настроек и временных пользовательских данных;
- serverless API, работающие с AI/TTS и Blob;
- один основной пользователь продукта.

Поэтому этот документ описывает:

1. логическую модель данных, которая понадобится продукту;
2. repository contracts, не зависящие от конкретной базы;
3. безопасный MVP без базы;
4. целевое состояние, если позже будет выбрано structured durable storage.

**PostgreSQL не считается уже принятым решением.** Реляционная база остаётся сильным кандидатом для adaptive-системы, но её провайдер, стоимость, auth-модель и миграционный путь должны быть утверждены отдельно. См. `15_STORAGE_OPTIONS_AND_DATABASE_MIGRATION_PLAN.md`.

## 2. Главный архитектурный принцип

Продуктовая логика не должна напрямую обращаться к:

- Vercel Blob SDK;
- localStorage;
- SQL;
- конкретному облачному provider SDK.

Она работает через repository interfaces.

```ts
export interface AppPreferencesRepository {
  get(userId: string): Promise<AppPreferences | null>;
  upsert(preferences: AppPreferences): Promise<AppPreferences>;
}

export interface LanguageProfileRepository {
  getByUser(userId: string): Promise<LanguageProfile[]>;
  get(userId: string, language: LanguageCode): Promise<LanguageProfile | null>;
  upsert(profile: LanguageProfile): Promise<LanguageProfile>;
}

export interface ContentCardRepository {
  // ContentCard is a canonical cross-language idea.
  listCandidates(query: CardCandidateQuery): Promise<ContentCard[]>;
  getById(cardId: string): Promise<ContentCard | null>;
  saveMany(cards: ContentCard[]): Promise<void>;
}

export interface FeedRepository {
  getLatest(userId: string, language: LanguageCode): Promise<FeedBatch | null>;
  save(batch: FeedBatch): Promise<void>;
}

export interface AnalyticsEventRepository {
  appendBatch(events: AnalyticsEvent[]): Promise<EventAppendResult>;
  query?(query: EventQuery): Promise<AnalyticsEvent[]>;
}

export interface LearningStateRepository {
  getForLanguage(userId: string, language: LanguageCode): Promise<UserLearningNodeState[]>;
  upsertMany(states: UserLearningNodeState[]): Promise<void>;
}

export interface GenerationJobRepository {
  get(jobId: string): Promise<GenerationJob | null>;
  create(job: GenerationJob): Promise<void>;
  update(jobId: string, patch: GenerationJobPatch): Promise<void>;
}

export interface LessonArtifactRepository {
  saveLesson(lesson: Lesson): Promise<LessonArtifactRef>;
  getLesson(lessonId: string): Promise<Lesson | null>;
  listLessons(userId: string): Promise<LessonSummary[]>;
}
```

## 3. Что можно реализовать без базы

### 3.1. Seed canonical cards

Хранить в репозитории как versioned JSON, независимо от одного языка:

```text
src/content/seeds/content-ideas.v1.json
src/content/seeds/language-adaptation-hints.v1.json   # optional
```

`ContentCard` хранит Russian editorial copy, topics, countries/regions, provenance и supported language/level constraints. `FeedItem` добавляет активный язык и уровень.

Преимущества:

- легко ревьюить в Git;
- детерминированные тесты;
- не нужен новый provider;
- можно сразу проверить UX и card → lesson flow.

Seed cards read-only. Они не должны изменяться из браузера.

### 3.2. Language profiles

Для личного MVP допустим временный adapter:

- server-side JSON в Vercel Blob; или
- текущий localStorage, если явно помечен как prototype-only.

Предпочтительный временный путь — Blob через serverless API, потому что профиль будет доступен между устройствами и не зависит от браузера.

Пример Blob layout:

```text
app-state/v1/users/{userId}/language-profiles/{revisionId}.json
app-state/v1/users/{userId}/language-profiles/latest.json
```

`latest.json` — небольшой pointer/manifest. При записи использовать optimistic version check, если текущий Blob flow это позволяет.

### 3.3. Feed batches

В первой версии feed можно пересчитывать детерминированно из:

- seed cards;
- language profile;
- недавней истории, сохранённой локально или в Blob.

Если persisted history пока не нужна, batch может жить в session/local cache. Но API и типы должны уже использовать `FeedBatch`, чтобы позже заменить adapter без переписывания UI.

### 3.4. Generation jobs

Если текущая генерация синхронная и уже показывает стадии, не нужно искусственно строить persistent job system только ради новой ленты.

MVP может:

- вызвать существующий endpoint;
- передать `cardId` и blueprint metadata;
- после готовности сохранить обычный `Lesson` в существующем Blob flow.

Persistent `GenerationJobRepository` нужен, когда появятся:

- восстановление после закрытия страницы;
- background generation;
- retries между serverless invocations;
- отдельный экран статусов.

### 3.5. События до базы

Допустимый промежуточный вариант — immutable batches в Blob:

```text
events/v1/{userId}/{yyyy-mm-dd}/{batchId}.json
```

Каждый batch имеет уникальный id и никогда не перезаписывается.

Плюсы:

- события не теряются полностью;
- легко импортировать позже;
- нет общей изменяемой JSON-ленты;
- не нужна база для первого теста.

Минусы:

- неудобные запросы;
- дорого и медленно строить аналитику;
- нет хороших индексов;
- сложно пересчитывать learning state;
- не подходит для нескольких активных пользователей.

Поэтому Blob events допустимы для короткого личного эксперимента, но не для полноценного adaptive ranking.

## 4. Рекомендуемые adapters по этапам

| Этап | Cards | Profiles | Feed history | Events | Learning state | Lessons |
|---|---|---|---|---|---|---|
| UI prototype | static JSON | localStorage | session/local | disabled/local debug | нет | existing Blob |
| Personal feed MVP | static JSON | Blob JSON | Blob/local | Blob immutable batches | нет или offline calculation | existing Blob |
| Adaptive MVP | structured store | structured store | structured store | durable event store | structured store | existing Blob |
| Multi-user production | structured store | structured store | structured store | scalable durable store | structured store | Blob/object storage |

## 5. Логические сущности

Ниже описаны domain records. Они не требуют SQL и должны существовать как TypeScript/Zod contracts.

### 5.1. `AppPreferences`

```ts
export interface AppPreferences {
  userId: string;
  activeLanguage: LanguageCode;
  enabledTopicIds: string[];
  enabledCountryOrRegionIds: string[];
  createdAt: string;
  updatedAt: string;
  revision: number;
}
```

`activeLanguage` — сквозной UI context. Topic/country preferences глобальны. Они не заменяют language-specific profiles и learning state.

### 5.2. `LanguageProfile`

```ts
export interface LanguageProfile {
  id: string;
  userId: string;
  language: LanguageCode;
  selectedLevel: CEFRLevel;
  targetLevel?: CEFRLevel;
  goalType: 'simple_reading' | 'progress_to_level' | 'vocabulary_breadth' | 'custom';
  goalNotes?: string;
  preferredReadingSeconds?: { min: number; max: number };
  levelTrialsEnabled: boolean;
  recommendationConfig: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  revision: number;
}
```

### 5.3. `ContentCard`

См. подробный контракт в `02_CONTENT_CATALOG_AND_CARD_SYSTEM.md`.

Базовый `ContentCard` уже содержит `schemaVersion`, `status`, `canonicalSubjectKey`, `createdAt` и `updatedAt`. Storage adapter может добавлять только техническую ревизию, не меняя domain contract:

```ts
interface StoredContentCard extends ContentCard {
  storageRevision?: number;
}
```

### 5.4. `FeedBatch`

```ts
export interface FeedBatch {
  id: string;
  userId: string;
  language: LanguageCode;
  selectedLevel: CEFRLevel;
  algorithmVersion: string;
  createdAt: string;
  contextSnapshot: FeedContextSnapshot;
  items: FeedItem[];
}
```

### 5.5. `LessonBlueprint`

```ts
export interface StoredLessonBlueprint {
  id: string;
  cardId?: string;
  userId: string;
  language: LanguageCode;
  targetLevel: CEFRLevel;
  promptContractVersion: number;
  data: LessonBlueprintData;
  status: 'draft' | 'validated' | 'used' | 'failed';
  createdAt: string;
  updatedAt: string;
}
```

### 5.6. `LessonRecord`

Полный `Lesson` остаётся в Blob. Structured store позже хранит только индекс и статус.

```ts
export interface LessonRecord {
  id: string;
  userId: string;
  cardId?: string;
  blueprintId?: string;
  language: LanguageCode;
  level: CEFRLevel;
  title: string;
  lessonArtifactRef: string;
  audioArtifactRef?: string;
  status: 'creating' | 'ready' | 'started' | 'completed' | 'failed';
  wordCount?: number;
  estimatedReadingSeconds?: number;
  alignmentSummary?: AlignmentReportSummary;
  startedAt?: string;
  lastOpenedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

### 5.7. `LearningNode` и `UserLearningNodeState`

См. `03_HIDDEN_LEARNING_PLAN.md`.

### 5.8. `AnalyticsEvent`

См. `05_TRACKING_EVENTS_AND_METRICS.md`.

Raw events immutable. Derived learning state можно удалять и пересчитывать.

## 6. Разделение источников истины

### До выбора базы

| Данные | Временный источник истины |
|---|---|
| полный Lesson | existing Vercel Blob |
| аудио | existing Vercel Blob |
| seed cards | versioned JSON в Git |
| app preferences / language profile | Blob JSON либо prototype localStorage |
| feed batch | вычисляется + optional Blob snapshot |
| generation metadata | current lesson flow / optional Blob JSON |
| raw events | disabled или immutable Blob batches |
| learning state | не включать в production ranking |
| UI theme/font | localStorage |

### После выбора durable structured store

| Данные | Целевой источник истины |
|---|---|
| полный Lesson/audio | Vercel Blob или другое object storage |
| lesson metadata/status | structured store |
| app preferences / profiles | structured store |
| cards/feed history | structured store |
| raw events | durable append/query store |
| learning state | structured store, пересчитываемо из events |
| UI preferences | localStorage, если не нужна синхронизация |

## 7. Почему Blob недостаточно для идеальной системы

Blob хорошо подходит для крупных immutable artifacts, но неудобен для:

- ranking queries;
- индексов по языку, уровню, времени и статусу;
- many-to-many связей card ↔ learning nodes;
- event deduplication и агрегаций;
- optimistic/transactional updates;
- нескольких пользователей;
- быстрых debug queries;
- регулярного пересчёта learning state.

Это объясняет, почему база, вероятно, понадобится позже, но не обязывает подключать её до проверки самой ленты.

## 8. Требования к будущему structured store

Не выбирать provider до ответа на вопросы:

- один пользователь или multi-user;
- нужна ли auth;
- ожидаемый объём events;
- нужны ли SQL joins и ad-hoc analytics;
- нужна ли local development database;
- стоимость и free-tier ограничения;
- backup/export;
- регион данных;
- serverless connection model;
- vendor lock-in;
- миграции и schema tooling.

Минимальные capabilities:

```ts
export interface StorageCapabilities {
  atomicWrite: boolean;
  uniqueConstraints: boolean;
  appendOnlyEvents: boolean;
  indexedQueries: boolean;
  transactions: boolean;
  exportable: boolean;
}
```

## 9. Реляционная схема как целевой ориентир

Если отдельный ADR выберет managed relational database, логические сущности обычно отображаются в таблицы:

```text
users
app_preferences
language_profiles
content_cards
learning_nodes
card_learning_nodes
lesson_blueprints
lessons
lesson_learning_nodes
feed_batches
feed_items
events
generation_jobs
saved_learning_units
source_registry
user_learning_node_state
```

Это **ориентир**, а не команда немедленно создавать migrations.

Ключевые ограничения будущей схемы:

- unique app preferences per user;
- unique `(user_id, language_code)` для profile;
- unique event id для idempotency;
- unique `(feed_batch_id, position)`;
- unique `(feed_batch_id, card_id)`;
- canonical card is cross-language; feed/blueprint/lesson store language + level snapshot;
- foreign key card → blueprint → lesson;
- raw events не обновляются;
- lesson artifacts остаются вне БД;
- JSONB допустим для prompt snapshots и score explanations, но не вместо всех нормализованных связей.

## 10. Миграция из MVP storage

Чтобы временный Blob/JSON вариант не стал тупиком:

1. Все records имеют UUID.
2. Все JSON имеют `schemaVersion`.
3. Даты хранятся в ISO 8601 UTC.
4. Language codes и CEFR enums централизованы.
5. Blob paths не используются как domain ids.
6. Repository interface возвращает domain object, а не SDK response.
7. Events хранятся immutable batches с уникальными ids.
8. Seed cards имеют стабильные card ids.
9. Импорт в будущую базу выполняется отдельным script.
10. После миграции adapters меняются, UI и recommendation domain остаются прежними.

Пример миграционной команды в будущем:

```text
scripts/import-blob-state-to-structured-store.ts
```

Она должна поддерживать dry-run и отчёт:

- imported;
- skipped duplicates;
- invalid schema;
- unresolved references;
- failed artifacts.

## 11. Чего Claude не должен делать сейчас

- не подключать PostgreSQL только потому, что он упомянут как возможная цель;
- не писать SQL migrations до Storage ADR;
- не переносить существующие Lesson JSON из Blob;
- не строить event analytics поверх одного изменяемого `events.json`;
- не привязывать React-компоненты к Blob SDK;
- не делать localStorage постоянным источником learning state;
- не включать adaptive ranking без durable и проверяемых событий.

## 12. Следующий обязательный шаг

До выбора базы создать:

```text
docs/content-system/STORAGE_DISCOVERY.md
```

Он должен описать:

- как сейчас устроены Blob index и save/load;
- какие записи реально должны изменяться;
- сколько пользователей предполагается;
- нужна ли синхронизация между устройствами;
- ожидаемый event volume;
- текущие Vercel ограничения проекта;
- варианты adapters без базы;
- критерии выбора будущего provider.

После этого создать отдельный ADR, а не молча выбирать технологию.

## 13. UX-derived query rules

- feed query always includes `activeLanguage` and selected level;
- main library query filters by `language`;
- main learn query filters saved units by `language`;
- `Continue` sorts by `lastOpenedAt DESC`;
- no production query/API is required for mixed `all languages` view in MVP;
- same `cardId` may have multiple `lessonId` values across languages/levels.
