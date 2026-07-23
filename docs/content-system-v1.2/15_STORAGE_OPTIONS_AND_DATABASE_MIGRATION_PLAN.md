# Варианты хранения и план подключения базы данных

## 1. Зачем нужен отдельный документ

Предыдущая версия документации слишком рано предполагала PostgreSQL.
В реальном проекте базы пока нет, а первая версия content feed может быть проверена
без неё.

Этот документ отделяет:

1. то, что можно сделать прямо сейчас;
2. момент, когда база становится действительно нужна;
3. критерии выбора storage;
4. безопасную миграцию без переписывания reader и генерации.

## 2. Текущее состояние

По существующей документации проекта:

- уроки сохраняются как JSON в Vercel Blob;
- аудио тоже хранится в Blob;
- библиотека использует простой индекс;
- отдельной реляционной базы нет;
- часть настроек и сохранений живёт в localStorage;
- основной пользователь пока один.

Это нормальная архитектура для раннего reader MVP.
Новая лента не должна автоматически превращать проект в большую backend-систему.

## 3. Какие новые данные появятся

### Можно хранить почти статически

- seed content cards;
- topic taxonomy;
- language learning map seeds;
- source registry seed;
- recommendation weights config.

### Изменяются редко

- language profile;
- selected level;
- target goal;
- user preferences;
- feature flags.

### Изменяются часто

- feed impressions;
- opened cards;
- reading progress;
- taps/details/translation;
- feedback;
- generation jobs;
- learning-node evidence;
- derived recommendation state.

Именно последняя группа в будущем создаёт потребность в durable structured store.

## 4. Вариант 0 — только localStorage

### Подходит

- одно устройство;
- быстрый UI prototype;
- проверка переключения уровней;
- тест каталога тем.

### Не подходит

- cross-device;
- надёжный tracking;
- server-side ranking;
- backup;
- migration confidence;
- несколько пользователей.

### Решение

Допустим только как короткий prototype adapter.
Все keys должны быть versioned и централизованы.

```text
context-reader:v1:language-profiles
context-reader:v1:recent-feed-history
context-reader:v1:event-queue
```

## 5. Вариант 1 — Git JSON + Vercel Blob, без базы

Это рекомендуемый путь для первой рабочей версии.

### Git JSON

Хранит:

- seed cards;
- learning maps;
- source registry seeds;
- recommendation config.

### Blob

Хранит:

- существующие Lesson/audio artifacts;
- language profile snapshots;
- optional feed snapshots;
- immutable event batches;
- optional blueprint/job snapshots.

### Пример layout

```text
app-state/v1/users/{userId}/profiles/{revisionId}.json
app-state/v1/users/{userId}/profiles/latest.json
app-state/v1/users/{userId}/feeds/{batchId}.json
events/v1/{userId}/{yyyy-mm-dd}/{eventBatchId}.json
blueprints/v1/{blueprintId}.json
lessons/{lessonId}/lesson.json
lessons/{lessonId}/audio/main.mp3
```

### Плюсы

- использует уже подключённый storage;
- нет нового provider и billing;
- быстро внедряется;
- достаточно для одного пользователя и product validation;
- данные можно экспортировать.

### Минусы

- нет нормальных запросов;
- ranking history приходится загружать и фильтровать вручную;
- event analytics неудобна;
- mutable pointers требуют аккуратности;
- concurrent writes сложны;
- learning-state recalculation будет медленным;
- плохо масштабируется.

### Ограничение

На этом варианте можно собрать реальные события, но adaptive ranking должен
оставаться выключенным или работать только в offline/debug режиме.

## 6. Вариант 2 — managed relational database

Сильный кандидат для целевой системы, потому что продукт имеет:

- profiles;
- cards;
- feed batches;
- many-to-many learning nodes;
- raw events;
- derived state;
- idempotency;
- debug queries;
- будущих пользователей.

### Плюсы

- связи и constraints;
- SQL analytics;
- transactions;
- event dedup;
- удобные migrations;
- понятная экспортируемая модель;
- проще строить debug dashboard.

### Минусы

- новый provider;
- настройка credentials;
- connection behavior в serverless;
- миграции и backup;
- auth/row ownership;
- стоимость и vendor decisions;
- больше backend complexity.

### Когда выбирать

Когда выполнено хотя бы одно:

- нужен cross-device durable state;
- начался adaptive ranking;
- накопились события, которые нужно регулярно агрегировать;
- появляется второй пользователь;
- нужны background jobs;
- Blob-based debug становится болезненным.

### Важное правило

Провайдер выбирается отдельным research/ADR с актуальной проверкой:

- цены;
- free tier;
- регион;
- serverless integration;
- backup/export;
- local development;
- limits.

Этот пакет намеренно не фиксирует конкретный сервис.

## 7. Вариант 3 — document/KV store

Может быть проще для profiles и cached feed, но хуже подходит для:

- many-to-many learning nodes;
- ad-hoc analytics;
- сложного ranking debug;
- пересчёта состояния из событий.

Подходит, если система останется очень маленькой и модель доступа почти всегда
`get by user id`.

Не выбирать только потому, что KV кажется “проще”. Сначала описать реальные queries.

## 8. Вариант 4 — внешний analytics + отдельное app storage

Можно отправлять продуктовые события во внешний analytics provider, а profiles/cards
оставить в Blob или небольшой базе.

Проблема: learning evidence является частью продуктовой логики, а не только dashboard.
Поэтому критические events всё равно должны быть доступны приложению в собственном
экспортируемом хранилище.

Внешняя аналитика может быть копией, но не единственным источником hidden plan.

## 9. Decision matrix

| Критерий | localStorage | Git + Blob | Relational DB | Document/KV |
|---|---:|---:|---:|---:|
| быстрый старт | высокий | высокий | средний | средний |
| cross-device | низкий | средний | высокий | высокий |
| события | низкий | низкий/средний | высокий | средний |
| сложные связи | низкий | низкий | высокий | низкий/средний |
| debug queries | низкий | низкий | высокий | средний |
| один пользователь | высокий | высокий | высокий | высокий |
| multi-user | низкий | низкий | высокий | высокий |
| миграции | ручные | ручные | хорошие | provider-specific |
| текущая интеграция | есть | есть | нет | нет |

## 10. Рекомендованное решение по этапам

### Сейчас

```text
Seed cards: Git JSON
Lesson/audio: existing Vercel Blob
Language profile: Blob JSON через repository adapter
Feed history: lightweight Blob/local snapshot
Events: immutable Blob batches или local debug export
Adaptive ranking: OFF
```

### После проверки feed

Создать ADR на основе реальных данных:

- сколько уроков читается;
- сколько событий в день;
- нужен ли второй device/user;
- нужны ли SQL queries;
- насколько неудобен Blob flow;
- какой monthly budget приемлем.

### После выбора базы

```text
Profiles/cards/feed/events/learning state: structured store
Lesson/audio: остаются в Blob
UI cache: localStorage
```

## 11. Storage ADR template

Создать файл:

```text
docs/adr/ADR-00X-durable-storage.md
```

Структура:

```md
# Durable storage for content feed and learning state

## Status
Proposed / Accepted / Rejected / Superseded

## Context
- current Blob architecture
- number of users
- event volume
- required queries
- deployment constraints

## Decision drivers
- cost
- reliability
- serverless support
- SQL/relations
- export/backup
- local development
- auth
- vendor lock-in

## Options considered

## Decision

## Migration plan

## Rollback plan

## Consequences
```

## 12. Repository-first implementation

Перед выбором provider Claude создаёт contracts и in-project adapters.

```text
Domain/service
    ↓
Repository interface
    ↓
StaticSeed / Blob / Local prototype adapter
    ↓ later
Database adapter
```

### Правила

- repository не возвращает SDK-specific objects;
- domain ids не равны Blob URLs;
- serialization versioned;
- adapters contract-tested одинаковыми тестами;
- UI не знает, где физически лежат данные;
- database adapter должен пройти те же repository contract tests.

## 13. Миграция временных данных

### Подготовка заранее

- стабильные UUID;
- `schemaVersion`;
- ISO timestamps;
- immutable event ids;
- stable language/level enums;
- manifest с revisions;
- no giant mutable file.

### Import script

```text
scripts/import-storage-state.ts
```

Режимы:

```text
--dry-run
--user <id>
--include profiles,feeds,events
--since <date>
--report ./migration-report.json
```

Отчёт:

- found;
- valid;
- imported;
- skipped duplicates;
- invalid schema;
- unresolved references;
- failed writes.

### Cutover

1. Deploy database adapter behind feature flag.
2. Run dry-run.
3. Import snapshots/events.
4. Compare counts.
5. Enable dual-read or shadow-read in development.
6. Switch read source.
7. Keep Blob source read-only for rollback.
8. Disable temporary writes after validation.

## 14. Что блокирует adaptive ranking

Adaptive ranking нельзя считать готовым, пока нет:

- durable raw events;
- event dedup;
- query/recalculation path;
- inspectable learning state;
- backup/export;
- ability to delete/reset user data;
- fixed baseline fallback.

Можно тестировать ranking на synthetic histories до подключения базы.

## 15. Конкретная команда Claude на текущем этапе

> Изучи существующий Blob storage и создай repository interfaces. Реализуй первую
> версию feed на seed JSON и текущем Blob flow. Не подключай новую базу данных и
> не создавай SQL migrations. Подготовь `STORAGE_DISCOVERY.md` и оставь durable
> storage как отдельный ADR до этапа tracking/adaptive ranking.

## UX-derived storage additions

Отдельно учитывать `AppPreferences` (active language + global topic/country ids), `lastOpenedAt`, language-scoped saved units и cross-language relation canonical card → multiple lessons. Это не меняет решения: provider базы пока не выбран.
