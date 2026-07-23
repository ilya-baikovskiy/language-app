# STORAGE_DISCOVERY — фактическое состояние хранения данных перед Content System v1.2

Дата: 2026-07-23. Ветка: `content-system-docs-v1.2`. Требуется
`15_STORAGE_OPTIONS_AND_DATABASE_MIGRATION_PLAN.md` (§12, §15) и
`11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md` как второй discovery-документ Phase 0.
Документ фиксирует факты и варианты — **не выбирает** технологию для будущих
`AppPreferences`/`LanguageProfile` и не принимает архитектурных решений: это остаётся
на отдельный Storage Decision Gate/ADR, как явно требует пакет документации.

## 1. Как устроено сохранение `Lesson` в Vercel Blob сейчас

### SDK и окружение

- Пакет: `@vercel/blob@^2.6.1` (единственная нестандартная runtime-зависимость в
  `package.json`, помимо React) — импортируются только `put` и `list` из него, нигде
  в коде не используется `del`, `copy`, `head` или прямой доступ к Blob REST API.
- Явных `process.env.BLOB_READ_WRITE_TOKEN` в коде нет — `@vercel/blob` читает его из
  окружения Vercel неявно (стандартное поведение SDK при деплое/локальном `vercel dev`
  с привязанным проектом). Других переменных окружения, специфичных для Blob, в
  коде не найдено.
- Ключи для AI/TTS-провайдеров: `OPENAI_API_KEY`, `OPENAI_TEXT_MODEL` (опционально,
  дефолт `gpt-4o`), `ELEVENLABS_API_KEY` — все читаются только внутри `api/*.ts`,
  никогда не передаются в клиентский бандл.

### Структура путей (pathnames) в Blob

Собрано по факту из `api/save-lesson.ts`, `api/generate-audio.ts`, `api/speak-unit.ts`:

```text
lessons/index.json              — единственный общий индекс библиотеки (см. ниже)
lessons/{slug}.json             — полный Lesson JSON, slug === lesson.id
audio/{slug}.mp3                — озвучка урока целиком, тот же slug
clips/{provider}/{language}/{sha256-hash}.mp3
                                 — кэш отдельных клипов слов/фраз (Bottom Sheet),
                                   hash = sha256(provider|language|voiceId|modelId|speed|text)
```

Никакого `app-state/v1/...`, `events/v1/...`, `blueprints/v1/...` — путей, которые
предлагает `15_STORAGE_OPTIONS_AND_DATABASE_MIGRATION_PLAN.md` §5 как рекомендуемый
layout для новых сущностей — в реальном Blob storage сейчас не существует. Это всё
предстоит ввести с нуля для новой системы, ничего переиспользовать из старых путей,
кроме самого факта наличия `lessons/*`, не получится напрямую.

### Как обновляется индекс библиотеки

`api/save-lesson.ts`, шаг за шагом:

1. `slug = lesson.id` (никакого отдельного slugify на сервере — сгенерирован заранее
   на клиенте в `generateLessonPipeline.ts` через `slugify(title)` +
   `Date.now().toString(36)`).
2. `put('lessons/{slug}.json', JSON.stringify(lesson), { access: 'public', addRandomSuffix: false, allowOverwrite: true })`.
3. Читает **весь** текущий `lessons/index.json` целиком через `readIndex()`
   (`list({prefix, limit:1})` → `fetch(blobs[0].url)` → `.json()`; при отсутствии —
   пустой массив).
4. Строит новую запись `LessonIndexEntry` (id, slug, title, translatedTitle, level,
   estimatedMinutes, lessonUrl, audioUrl, audioProvider, languageCode, createdAt) и
   формирует новый массив: `[entry, ...index.filter(e => e.slug !== slug)]`
   (upsert по slug, новая запись — в начало).
5. Перезаписывает **весь** `lessons/index.json` одним `put(..., allowOverwrite: true)`.

Это классический read-modify-write без какой-либо блокировки/версионирования/
optimistic concurrency check. При двух параллельных сохранениях (два одновременных
завершения генерации) возможна потеря одной из записей индекса (race condition) —
для одного пользователя и последовательного использования это практически не
проявляется, но это реальное архитектурное ограничение текущего Blob-flow, которое
явно унаследует и любой временный `LessonArtifactRepository` adapter поверх него,
если не добавить own concurrency-защиту.

`api/lessons.ts` (GET) — зеркальное чтение: `list({prefix: 'lessons/index.json', limit: 1})`
→ `fetch` → `.json()`, при любой ошибке или отсутствии блоба тихо возвращает `[]`
(не 500) — так что клиент (`LibraryPage.tsx`) не может отличить "уроков пока нет" от
"индекс не читается по другой причине", если запрос не бросил сетевую ошибку до этого.

### Что реально уже пишется/читается в Blob (полный список record-типов на сегодня)

- `lessons/index.json` — единственный mutable JSON, полностью перезаписываемый на
  каждое сохранение урока.
- `lessons/{slug}.json` — immutable per-lesson JSON (перезаписывается только если тот
  же `slug` пересохраняется явно, `allowOverwrite: true` формально это разрешает, но
  ни один текущий код-путь не делает update существующего урока).
- `audio/{slug}.mp3` — immutable per-lesson аудио.
- `clips/{provider}/{language}/{hash}.mp3` — контент-адресуемый кэш, естественно
  immutable (одинаковый hash ⇒ одинаковый контент), никогда не удаляется.

Никаких записей вида `app-state/...`, `events/...`, профилей пользователя, feed
snapshot'ов — не существует. Blob сейчас используется исключительно для `Lesson`
артефактов и производного от них аудио/клипов.

## 2. Полный список ключей `localStorage` в проекте

По `grep -rn "localStorage" src/` (см. также `IMPLEMENTATION_DISCOVERY.md` §6),
ровно два ключа во всём проекте:

| Ключ | Файл | Содержимое | Формат |
|---|---|---|---|
| `context-reader:preferences` | `src/hooks/useReaderPreferences.ts` | `{ theme: 'light'\|'dark', fontSize: 'small'\|'medium'\|'large', translationMode: boolean }` | plain JSON, без версии схемы |
| `context-reader:saved` | `src/hooks/useSavedUnits.ts` | `SavedUnit[]`, где `SavedUnit = { lessonId, tokenId, displayText, shortTranslation, savedAt: number }` | JSON-массив, без версии схемы, помечен в коде как явный "стаб v1" без экрана просмотра |

Оба ключа:

- читаются лениво в `useState(() => loadStored())`, при `typeof window === 'undefined'`
  возвращают дефолт/пустое значение (SSR-safety, хотя проект и без SSR — Vite SPA);
- пишутся в `useEffect` на каждое изменение состояния, в `try/catch`, тихо
  игнорируя ошибку (приватный режим браузера, переполненная квота) — так что
  предпочтение/сохранение в таком случае просто не переживёт перезагрузку, без
  сообщения пользователю;
- **не версионированы** (нет поля вида `schemaVersion` и нет префикса `v1` в самом
  имени ключа) — это расходится с рекомендацией
  `15_STORAGE_OPTIONS_AND_DATABASE_MIGRATION_PLAN.md` §4 приводить пример ключей вида
  `context-reader:v1:language-profiles` — реальные текущие ключи так не называются,
  и вводить версионирование для НОВЫХ ключей новой системы можно, не трогая эти два
  существующих (переименовывать их не требуется и не входит в эту задачу).

Других мест использования `localStorage`/`sessionStorage` (включая `window.name`,
IndexedDB, cookies) в `src/`, `api/`, `lib/` не найдено.

## 3. Auth / модель пользователя

Явно подтверждено: **никакой auth или user-модели в проекте нет.**

- `grep -rni "userid\|auth"` по `api/*.ts` и `src/` не находит ни одного файла с
  логикой авторизации, сессий, учётных записей или проверки токена доступа.
- Ни один `/api/*` эндпоинт не проверяет заголовки авторизации, cookie сессии или
  какой-либо `userId` — все запросы обрабатываются одинаково для любого вызывающего.
- Ни в `Lesson`, ни в `LessonIndexEntry`, ни в localStorage-записях (`SavedUnit`,
  reader preferences) нет поля `userId` или любого другого namespacing по
  пользователю — `lessons/index.json` один общий на весь Blob store, без разделения.
- Это соответствует и продуктовому описанию (`PRODUCT_OVERVIEW.md`: "основной
  пользователь продукта — сам создатель проекта"), и явному пункту в
  `06_DATA_MODEL_AND_STORAGE.md`/`15_...md` ("один основной пользователь продукта").

Практическое следствие: репозиторные интерфейсы новой системы (`AppPreferencesRepository.get(userId)`
и т.п.) по документации уже параметризованы `userId`, но в реальном приложении сейчас
неоткуда взять реальный `userId` — потребуется либо константный placeholder
(`'default-user'`/аналогичный), либо явное решение отложить параметр `userId` до
появления настоящей multi-user модели. Выбор конкретного подхода — не предмет этого
discovery-документа.

## 4. Рекомендованные repository-интерфейсы новой системы (пересказ документации, не решение)

Ниже — краткий пересказ того, что описывают `15_STORAGE_OPTIONS_AND_DATABASE_MIGRATION_PLAN.md`
и `06_DATA_MODEL_AND_STORAGE.md` для новых репозиториев. Это не выбор технологии — это
то, что каждый интерфейс должен инкапсулировать, независимо от того, какой adapter
будет выбран.

- **`ContentCardRepository`** — инкапсулирует доступ к каноническим (кросс-языковым)
  content ideas: `listCandidates(query)`, `getById`, `saveMany`. Документация прямо
  рекомендует MVP-adapter — `StaticSeedCardRepository`, читающий versioned JSON из
  `src/content/seeds/content-ideas.v1.json` (Git, read-only из браузера).
- **`FeedRepository`** — `getLatest(userId, language)`/`save(batch)` для конкретной
  показанной пятёрки карточек (`FeedBatch`). Допустимо не персистить вовсе на первом
  шаге (session/local cache) — важно, чтобы типы (`FeedBatch`/`FeedItem`) уже были
  контрактом, независимым от adapter'а.
- **`AppPreferencesRepository`** и **`LanguageProfileRepository`** — глобальные
  (активный язык, включённые темы/страны) и per-language (уровень, цель, план
  чтения) настройки пользователя. Здесь и есть открытый вопрос "Blob JSON vs
  localStorage", см. §5 ниже — документация сознательно не выбирает его заранее.
- **`AnalyticsEventRepository`** — `appendBatch(events)`/опциональный `query`. В первом
  PR не нужен вообще (см. `11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md`: "В первом PR не
  нужны"). Raw events должны быть immutable в любом adapter'е.
- **`LearningStateRepository`** — состояние по `LearningNode` (скрытый учебный план).
  Добавляется только на Phase 6, не в первом PR.
- **`GenerationJobRepository`** — нужен только если генерация станет асинхронной с
  восстановлением после закрытия страницы/retries между invocations; текущий пайплайн
  синхронный (клиент сам оркестрирует пошагово, см.
  `IMPLEMENTATION_DISCOVERY.md` §4) и **явно не требует** persistent job-модели прямо
  сейчас, по формулировке самого пакета документации ("если текущая генерация
  синхронная и уже показывает стадии, не нужно искусственно строить persistent job
  system только ради новой ленты" — что и есть текущий случай).
- **`LessonArtifactRepository`** — `saveLesson`/`getLesson`/`listLessons`. Первая
  реализация — adapter поверх уже существующего `api/save-lesson.ts` +
  `api/lessons.ts` flow (см. §1 выше); это единственный из перечисленных
  репозиториев, для которого в проекте уже есть полностью рабочий backend, просто не
  спрятанный за интерфейсом.

## 5. Trade-offs Blob JSON vs localStorage для `AppPreferences`/`LanguageProfile` (как есть в документации, без выбора)

Пересказ `15_STORAGE_OPTIONS_AND_DATABASE_MIGRATION_PLAN.md` (§4, §5, §9-10) и
`06_DATA_MODEL_AND_STORAGE.md` (§3.2) — открытый вопрос, финальное решение за
пользователем на Storage Decision Gate:

**Вариант "только localStorage"**

- Плюсы: не нужен новый эндпоинт, реализуется быстрее всего, соответствует
  единственному существующему прецеденту (`useReaderPreferences.ts`,
  `useSavedUnits.ts` уже делают именно это).
- Минусы: не работает cross-device (документация явно указывает, что для
  `LanguageProfile` "предпочтительный временный путь — Blob через serverless API,
  потому что профиль будет доступен между устройствами и не зависит от браузера");
  не может быть единственным долгосрочным источником данных по прямому запрету в
  `11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md` ("не делать localStorage постоянным
  источником learning state").
- Допустим только как явно помеченный prototype-only adapter
  (`15_...md` §4: "Допустим только как короткий prototype adapter").

**Вариант "Blob JSON через serverless API"**

- Плюсы: переиспользует уже подключённый provider (нет нового billing/credentials);
  доступен между устройствами; пример layout уже предложен документацией:
  `app-state/v1/users/{userId}/language-profiles/{revisionId}.json` +
  `.../latest.json` как pointer/manifest.
  Практическое преимущество: у проекта уже есть работающий пример именно такого
  read-modify-write flow — `api/save-lesson.ts` (см. §1) — так что паттерн
  (`put`/`list`/`fetch`) для нового `/api/app-preferences` эндпоинта не нужно
  изобретать заново, только повторить.
- Минусы, общие для Blob как хранилища small mutable state (не специфичные для
  profiles): нет optimistic concurrency из коробки (см. §1 — тот же race, что и у
  `lessons/index.json`), нет нормальных запросов, mutable pointers (`latest.json`)
  требуют аккуратности при конкурентной записи.

Документация фиксирует именно этот вариант как "предпочтительный временный путь" для
`LanguageProfile` (`06_DATA_MODEL_AND_STORAGE.md` §3.2), но явно не как обязательное
решение — выбор между этими двумя вариантами (или гибрид: localStorage как быстрый UI
cache поверх Blob как источника истины) остаётся открытым вопросом для отдельного
обсуждения с пользователем, а не для этого discovery-документа.

## 6. Сколько пользователей и нужна ли синхронизация — факты, не решение

- Сейчас в продукте технически и продуктово ровно один пользователь (см. §3) —
  никакой namespacing, auth или multi-tenancy не заложены.
- Проект уже используется с разных машин (см. `CLAUDE.md`: `PROGRESS.md` коммитится в
  git специально, "чтобы быть доступным при работе с другой машины или из
  claude.ai/code") — то есть хотя бы намерение работать с нескольких устройств уже
  есть на уровне документации проекта, хотя явного требования "cross-device
  синхронизация пользовательских данных" пока никто не подтвердил как активную
  потребность.
- Решение о том, насколько критична cross-device синхронизация для
  `AppPreferences`/`LanguageProfile` именно сейчас — открытый вопрос, не факт,
  который можно вывести из кода; фиксируется здесь как вопрос к пользователю, а не
  как ответ.

## 7. Вывод для Phase 0 (без принятия решения)

- Blob-flow для `Lesson` уже рабочий, read-modify-write, без версионирования схемы и
  без concurrency-защиты — новый `LessonArtifactRepository` adapter может обернуть
  его как есть, унаследовав то же ограничение по конкурентным записям.
- localStorage используется ровно в двух местах, оба некритичны для новой системы
  напрямую (UI preferences и стаб сохранения слов) — новую систему они не блокируют,
  но и не являются прецедентом версионированных ключей, который стоит слепо
  копировать.
- Auth/multi-user отсутствует полностью — любой `userId` в новых интерфейсах пока
  либо placeholder, либо предмет отдельного решения.
- Выбор adapter'а для `AppPreferences`/`LanguageProfile` (localStorage vs Blob JSON)
  и последующая durable storage (реляционная БД/KV/что-то ещё) — оба открытых
  вопроса, которые по прямому указанию `11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md` и
  `15_STORAGE_OPTIONS_AND_DATABASE_MIGRATION_PLAN.md` не решаются в этом документе и
  не должны решаться в первом PR без отдельного ADR/явного сигнала пользователя.
