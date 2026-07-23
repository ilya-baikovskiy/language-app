# MVP roadmap и критерии готовности

## Стратегия

Сначала проверить саму ленту и card → Lesson flow на минимальном storage.
Затем принять отдельное решение о постоянной базе.
Только после этого строить durable analytics и hidden-plan adaptation.

## Phase 0 — repository discovery

Создать `IMPLEMENTATION_DISCOVERY.md`:

- routes;
- Lesson schema;
- current Blob save/load/index flow;
- generation endpoints;
- auth/user assumptions;
- IDs;
- tests;
- integration risks;
- расхождения документации и кода.

Создать `STORAGE_DISCOVERY.md`:

- какие данные сейчас уже сохраняются;
- какие новые данные нужны;
- что можно хранить временно в JSON/Blob;
- что потребует durable structured store;
- какие ограничения есть у deployment.

**DoD:** Claude понимает реальный код и не выбирает базу по предположению.

## Phase 1 — storage-independent foundation

- shared Zod/TypeScript contracts;
- repository interfaces;
- `StaticSeedCardRepository`;
- adapter к существующему Lesson Blob storage;
- временный `LanguageProfileRepository` через Blob JSON или prototype localStorage;
- feature flags;
- stable ids и schema versions.

**Не входит:** PostgreSQL, SQL migrations, auth provider.

**DoD:** продуктовая логика не импортирует конкретный storage SDK; уровни и цели сохраняются выбранным временным adapter.

## Phase 2 — canonical seed cards + mobile app shell без базы

- 40–80 canonical seed ideas с supported language/level constraints;
- app preferences и один глобальный active language;
- top language selector с flag + language + level;
- glass bottom nav: Choose / Library / Learn;
- fixed five-slot composer;
- hero card без `Главная` badge;
- Russian card titles/descriptions;
- provenance + duration chips;
- refresh;
- settings: language levels, global topics, global countries/regions;
- language-scoped library/learn shells;
- optional feed snapshot;
- recent impression cache для repetition penalty.

**DoD:** полноценный Lesson не создаётся до выбора; лента работает без новой базы.

## Phase 3 — card → current generation pipeline

- blueprint contract;
- передача `cardId` и metadata в текущую генерацию;
- idempotency на уровне request key;
- progress;
- library creating/ready state;
- retry без дубликата;
- существующий `Lesson` остаётся совместимым.

Persistent job store добавляется только если текущий flow действительно требует восстановления между сессиями.

**DoD:** один выбор создаёт один lesson, reader и Bottom Sheet не сломаны.

## Phase 4 — минимальный tracking experiment

- event contracts;
- client queue;
- feed/reader/tap/translation/feedback instrumentation;
- временный storage:
  - local debug export; или
  - immutable event batches в Blob;
- simple inspection script/page;
- event schema versioning.

**DoD:** можно собрать реальные сигналы для личного теста, но adaptive ranking ещё выключен.

## Storage Decision Gate

После Phase 2–4 остановиться и принять отдельный ADR.

Нужно решить:

- нужна ли база уже сейчас;
- один пользователь или multi-user;
- нужна ли auth;
- какой объём событий;
- relational / document / analytics store;
- стоимость, backup, export и local development;
- как мигрировать временные JSON/Blob records.

Документ: `15_STORAGE_OPTIONS_AND_DATABASE_MIGRATION_PLAN.md`.

**Без утверждённого ADR не создавать SQL migrations.**

## Phase 5 — durable structured storage

Только после Storage ADR:

- подключить выбранный provider;
- реализовать production repositories;
- migration tooling;
- импорт временных profiles/feed/events;
- event deduplication;
- query/debug support;
- backup/export procedure.

**DoD:** structured state переживает reload/device switch и может быть диагностирован; старые Blob lessons доступны.

## Phase 6 — learning maps and passport

- language-specific nodes;
- card-node links;
- lesson passport;
- state updater;
- recalculation command из raw events;
- confidence и decay.

**DoD:** состояние раздельно по языкам; один урок не закрывает node; state можно пересчитать.

## Phase 7 — adaptive ranking behind flag

- interest fit;
- level fit;
- learning gaps;
- mandatory coverage;
- diversity;
- repetition;
- explainability;
- baseline comparison.

**DoD:** каждый item имеет reason codes; hero остаётся interest-first; fixed baseline доступен как fallback.

## Phase 8 — level trials

- eligibility;
- одна next-level карточка;
- trial tracking;
- explicit user suggestion;
- accept/decline.

**DoD:** система никогда не меняет уровень молча.

## Phase 9 — source registry and factual cards

- trusted sources;
- source fetch/extract;
- claim mapping;
- expiry;
- attribution;
- factual review.

**DoD:** factual card без source не проходит validation.

## Рекомендуемый первый релиз

Phase 0–3, опционально минимальная часть Phase 4:

- можно проверить привлекательность ленты;
- выбор форматов;
- card → lesson;
- generation UX;
- настройки языков;
- без преждевременной базы;
- без “умной” адаптации.

## Общие acceptance criteria

### Feed

- 5 разных карточек;
- hero — самая интересная eligible и не имеет `Главная` badge;
- один global active language;
- отдельные language feeds;
- Russian editorial titles/descriptions;
- exactly provenance + duration chips;
- topics/countries отсутствуют на main feed;
- refresh работает;
- нет duplicate positions;
- cached fallback;
- seed content versioned.

### Generation

- after selection only;
- idempotent request;
- auto library;
- retryable failure;
- old Lesson contract preserved.

### Navigation and language

- three bottom tabs;
- language change updates all tabs;
- no current/all control;
- library/learn language-scoped;
- Reader hides bottom nav.

### Reader

- current Lesson supported;
- Bottom Sheet works;
- translation separate;
- audio alignment gate preserved.

### Tracking experiment

- impression/open;
- lesson start/progress/complete;
- taps/details/save;
- translation;
- feedback;
- exportable schema;
- adaptive behavior выключено без durable store.

### Storage до базы

- storage accessed through repositories;
- artifacts remain in Blob;
- seed cards in Git JSON;
- temporary records schema-versioned;
- no single mutable giant JSON file;
- no storage SDK imports in domain/UI.

### Storage после ADR

- production repositories;
- idempotent events;
- backup/export;
- migration script with dry-run;
- old Blob lessons preserved.

## Definition of Done для каждого PR

- tests included;
- docs updated;
- feature flag for risky behavior;
- typed errors;
- no secrets in client;
- mobile smoke test;
- old lessons regression test;
- no duplicated domain enums;
- storage-specific code isolated in adapters;
- migration included **только если storage ADR уже принят и PR меняет persistent schema**.

### UX source of truth

- implementation is visually checked against `_prototype_reference/context_reader_content_feed_prototype_v8.html`;
- behavior is checked against `16_APPROVED_MOBILE_UX_AND_NAVIGATION.md`;
- prototype code is not copied wholesale.
