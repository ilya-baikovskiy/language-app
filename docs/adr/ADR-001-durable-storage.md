# ADR-001: Durable storage for content feed and learning state

## Status

Accepted (2026-07-23)

## Context

Content System v1.2 (PR 1–4 из `docs/content-system-v1.2/11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md`)
реализовано целиком на Vercel Blob + repository-интерфейсах, без постоянной базы
данных — см. `docs/content-system-v1.2/15_STORAGE_OPTIONS_AND_DATABASE_MIGRATION_PLAN.md`
(«Вариант 1 — Git JSON + Vercel Blob, без базы») и `docs/content-system/STORAGE_DISCOVERY.md`.

По брифу перед PR 5+ (реальная БД, если решено), PR 6 (learning maps) и Phase 7
(adaptive ranking) нужно пройти **Storage Decision Gate**: написать этот ADR на
основе реальных вводных, не подключать базу молча.

### Текущая архитектура (факты, см. STORAGE_DISCOVERY.md)

- Единственный backend — `@vercel/blob`. `Lesson`/аудио/клипы — immutable
  per-artifact JSON/mp3. `lessons/index.json`, `app-state/v1/users/{userId}/...`
  (`AppPreferences`, `LanguageProfile`), `events/v1/{userId}/{date}/{batchId}.json`
  (analytics) — read-modify-write (индексы) или append-only immutable (события).
- Ни одного concurrency-инцидента на read-modify-write индексах не зафиксировано
  на практике — для одного последовательного пользователя гонка при двух
  одновременных записях маловероятна.
- Repository-интерфейсы (`src/content-system/repositories.ts`) уже полностью
  изолируют domain/UI-код от Blob SDK — смена storage adapter в будущем не
  требует переписывать вызывающий код.
- Auth/multi-user модели нет вообще — один пользователь продукта, без namespacing.

### Вводные от пользователя (2026-07-23)

1. Один пользователь сейчас, использует с двух устройств (компьютер для
   разработки/тестирования, телефон для реального чтения) — это уже покрыто
   выбором «Blob через API», не localStorage (см. PR 1 — cross-device был
   явным критерием этого выбора).
2. Решаем сейчас, качественно, не откладываем ради сбора метрик. Event tracking
   (PR 4) включат в проде позже, по мере реального использования — это не
   блокирует данное решение.
3. Уже замечена разница между локальной разработкой и продакшеном — но по
   опыту этой же сессии это была разница в конфигурации окружения (Blob store
   не был подключён к Preview environment в Vercel, не лимит самого Blob как
   хранилища).
4. Бюджет: пока только free tier. При будущем переходе на управляемую БД
   пользователь называет Supabase как вероятного кандидата.
5. Явный вопрос: можно ли нормально жить на Blob дальше, включая будущие
   функции — сохранение слов и их тренировку (spaced repetition/SRS)?

## Decision drivers

- cost — сейчас только free tier;
- reliability — для одного пользователя достаточно текущего Blob-flow;
- serverless support — Blob уже нативно интегрирован с Vercel functions;
- SQL/relations — пока не требуются (нет many-to-many learning nodes в проде,
  Phase 6 не начат);
- export/backup — Blob-файлы уже читаемый плоский JSON, экспортируется просто;
- local development — Blob уже работает и локально, и на preview (после фикса
  подключения store к Preview environment);
- auth — не требуется, один пользователь;
- vendor lock-in — Blob уже выбран для существующего Lesson/audio flow,
  дополнительный lock-in от расширения его использования на profiles/events/
  learning state минимален (repository-интерфейсы уже абстрагируют это).

## Options considered

См. полное описание вариантов и decision matrix в
`docs/content-system-v1.2/15_STORAGE_OPTIONS_AND_DATABASE_MIGRATION_PLAN.md` §4-9.

| Критерий | localStorage | **Git + Blob (текущий)** | Relational DB | Document/KV |
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

Для одного пользователя без cross-device-конфликтов и без adaptive ranking
разница между «Git + Blob» и «Relational DB» по большинству строк не
материализуется в реальную боль — сильные стороны БД (события, сложные связи,
debug queries, multi-user) относятся к сценариям, которых у продукта пока нет.

## Decision

**Остаёмся на Vercel Blob (Вариант 1) для всего текущего и обозримого будущего
функционала — включая сохранение слов и их тренировку (SRS) — пока не сработает
один из явных триггеров** ниже. Управляемую БД не подключаем сейчас.

**Supabase зафиксирован как предварительно выбранный кандидат** на случай
срабатывания триггера — конкретный провайдер не подключается этим ADR, выбор
остаётся отдельным решением с проверкой актуальных цен/free tier/serverless
integration на момент триггера (см. `15` §6 «Провайдер выбирается отдельным
research/ADR с актуальной проверкой»).

### Обоснование по конкретным будущим функциям

**Сохранение слов + SRS-тренировка** (следующая продуктовая работа после
Content System v1.2, вне рамок этого ADR) — предполагаемый паттерн: read-modify-write
JSON per user, например `learning/v1/users/{userId}/saved-units.json`, тот же
подход, что уже работает для `lessons/index.json`, `app-preferences.ts`,
`language-profiles.ts`. Запрос «что повторять сегодня» — прочитать файл целиком
и отфильтровать на клиенте/сервере; при реалистичном объёме для одного человека
(сотни — низкие тысячи сохранённых единиц) это не узкое место. Concurrency-риск
(два review-сеанса одновременно с одного аккаунта) — на практике для одного
человека пренебрежимо мал, тот же уровень риска, что уже принят для остального
Blob-flow.

**Tracking/events** (PR 4) — уже immutable batches в Blob, корректно для
personal-масштаба. Агрегация на реальных данных, когда понадобится, может
считаться оффлайн-скриптом по выгруженным batch-файлам — БД для этого пока не
обязательна.

**Adaptive ranking / learning-node state** (Phase 6/7 из мастер-брифа) —
единственное место, где `15` §14 прямо требует durable event store с dedup и
recalculation path до реального включения. Это уже вне ближайшего скоупа и
остаётся выключено флагами `adaptiveRankingEnabled`/`learningStateUpdatesEnabled`.

### Явные триггеры пересмотра этого решения

Вернуться к этому вопросу, если сработает хотя бы один:

- появляется второй реальный активный пользователь (не тестовый/dev-аккаунт);
- начинается реализация Phase 7 (adaptive ranking) — по `15` §14 это жёсткое
  предусловие для durable event store;
- накопленный объём событий/уроков делает read-modify-write индексов заметно
  медленным или ненадёжным на практике (не гипотетически);
- нужны background jobs (асинхронная генерация, восстановление после закрытия
  страницы) — сейчас пайплайн синхронный;
- Blob-based debugging/аналитика становится ощутимо болезненной в реальном
  использовании (а не в теории).

## Migration plan

Repository-first подход уже в силе (`15` §12): domain/UI-код обращается только
к `AppPreferencesRepository`/`LanguageProfileRepository`/`ContentCardRepository`/
`FeedRepository`/`LessonArtifactRepository`/`AnalyticsEventRepository`, никогда
напрямую к Blob SDK. Когда сработает триггер выше:

1. Research/ADR на конкретного provider (вероятно Supabase, но с реальной
   проверкой цен/лимитов/serverless-интеграции на тот момент — не переносить
   это предположение как решённое).
2. Реализовать database adapter по тем же repository-интерфейсам, что уже есть
   (никаких изменений в domain/UI-коде).
3. `scripts/import-storage-state.ts` (dry-run → import → сравнение счётчиков)
   по шаблону `15` §13.
4. Cutover по шагам `15` §13 (feature flag → dry-run → import → shadow-read →
   switch → Blob остаётся read-only для отката → отключить временные записи).

## Rollback plan

Не применимо — cutover на БД этим ADR не начат. Откатывать пока нечего: текущее
состояние (Blob) и есть baseline.

## Consequences

- Blob остаётся единственным источником истины для всех данных Content System
  (Lesson/audio, AppPreferences, LanguageProfile, events, а в будущем — saved
  units/SRS state) до срабатывания одного из триггеров выше.
- Никакого нового provider, billing или credentials прямо сейчас не требуется.
- `eventTrackingEnabled` остаётся управляемым через feature flag/env var (см.
  `src/content-system/featureFlags.ts`) — включение в проде отделено от этого
  решения и делается пользователем по мере реального использования.
- Repository-интерфейсы, уже построенные в PR 1–4, остаются единственной точкой
  изменения при будущем переходе — переоценивать архитектуру не потребуется,
  только заменить adapter.
- Полноценный SRS/тренировка слов не реализуются этим ADR — это отдельная
  будущая продуктовая задача (16 §10 явно выносит её за рамки текущего MVP);
  здесь зафиксировано только то, что Blob будет для неё достаточен, когда до
  неё дойдёт очередь.
