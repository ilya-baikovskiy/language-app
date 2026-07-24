# PROGRESS — живой статус проекта

Этот файл — переносимая память проекта: что сделано, что в процессе, что дальше и
почему. В отличие от `PLAN.md` (статичный план этапов) и `DESIGN.md`/`AI_PIPELINE.md`
(зафиксированные решения), этот файл **обновляется по ходу работы** и коммитится в git,
поэтому он доступен при клоне репозитория на другой машине или в claude.ai/code —
в отличие от локальной памяти Claude Code, которая привязана к конкретному компьютеру.

**Начинай сессию с чтения этого файла. Обновляй его при завершении этапа или значимого
куска работы — особенно то, что не восстановить простым чтением кода/git log (мотивация,
открытые вопросы, отклонённые варианты).**

## Текущий статус (2026-07-24): сохранённые слова — Blob вместо localStorage (Этап A из плана SRS)

По запросу пользователя ("просто сохранять списки слов, тренировку доделаем
потом") — сделан только Этап A из ранее согласованного плана SRS, без
планировщика повторов и экрана тренировки:

- `src/content-system/savedWord.ts` — схема `SavedWord`/`ReviewState`.
  `ReviewState` заполняется стартовым значением уже сейчас (дешевле, чем
  мигрировать схему второй раз), но сам SM-2-планировщик и UI тренировки — НЕ
  сделаны, это отдельная будущая задача.
- Хранилище — `api/user-state.ts`, `kind=saved-words` (не отдельный файл —
  проект уже на лимите Vercel Hobby в 12 serverless-функций, см. историю
  Pipeline A выше). `useSavedUnits.ts`/localStorage удалены, новый
  `useSavedWords.ts` мигрирует старые записи один раз (флаг в localStorage).
- `LearnPage.tsx` теперь фильтрует по `SavedWord.language` напрямую — старый
  join lessonId → Lesson.languageCode через `BlobLessonArtifactRepository`
  больше не нужен.
- Реальные тесты на хук (сохранение с полными данными, снятие сохранения,
  фильтр по языку, одноразовая миграция) — 104 теста всего, build/lint чисто.

**Дальше (не сделано, следующий шаг когда решим вернуться к тренировке):**
SM-2-планировщик (`scheduleNext`), экран очереди повторения с удалением слова
из тренировки, и сам режим упражнения — формат уже обсуждён и утверждён
(прототип-артефакт: перевод фразы + AI-разбор ответа с пропусками/ошибками,
не бинарное «помню/не помню»), но код не начат.

## Хэндофф на другую машину (2026-07-23, конец сессии)

Кратко, для быстрого старта на другом компе/сессии — детали по каждому PR ниже
и в `docs/content-system-v1.2/`.

**Где мы:** ветка `content-system-docs-v1.2`, PR 1–4 из
`docs/content-system-v1.2/11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md` сделаны,
закоммичены и запушены (см. `git log --oneline`):
1. PR 1 — storage-independent контракты/repositories (Zod-схемы, seed cards,
   Blob-адаптеры).
2. PR 2 — mobile shell (bottom nav, глобальный language selector, ChoosePage
   с лентой из 5 карточек, Library/Learn language-scoped, Settings).
3. PR 3 — card → Lesson: реальная генерация по клику «Читать» через
   `LessonBlueprint`, идемпотентный `lessonId`, статусы библиотеки
   `creating`/`ready`/`failed`.
4. PR 4 — tracking: клиентская очередь событий, immutable Blob-батчи,
   инструментация feed/reader/generation/navigation, dev-only debug-экран.
   **Feedback-UI (`⋯`-меню) сознательно не строился** — такого элемента в
   продукте нет, добавлять новый UX внутри трекинговой задачи без
   обсуждения нельзя (см. запись PR 4 ниже).
5. Отдельный коммит между PR 2 и PR 3 — фикс CSS-бага (модалка настроек не
   центрировалась, не было базовых стилей `.overlay`/`.modal`).

**Проверено:** `tsc -b`/`oxlint`/`vitest run`/`npm run build` чисты на каждом
шаге. Дополнительно проверен реальный Vercel preview-деплой этой ветки (до
PR 4) — после того как пользователь подключил Blob store к Preview-окружению
и пересобрал деплой, `/api/lessons`, `/api/app-preferences`,
`/api/language-profiles` отвечают корректно на реальном Blob (не просто
локальный `tsc`). **Важно:** этот Preview, судя по ответам API, делит один
Blob store с продакшеном — не дёргать `PATCH`/`POST` эндпоинты (сохранение
preferences, старт генерации, теперь и `/api/events-batch`) на preview через
curl/скрипты, это пишет в настоящее хранилище пользователя; такие вещи
проверять только кликами в браузере.

**Не проверено визуально** (нет browser-инструмента в этой сессии, только
curl/HTML-фетч): сам клик-through Choose → генерация карточки → Reader,
«Повторить» на упавшей записи в Library, реальный вид ленты/bottom nav/
settings/debug-экрана глазами на узком viewport, и — специфично для PR 4—
реальное срабатывание `IntersectionObserver` для `card_impression`. Стоит
открыть preview в браузере и пройти этот путь перед тем, как считать
PR 1–4 полностью принятыми.

**Что дальше:** Storage Decision Gate пройден (см. запись ниже и
`docs/adr/ADR-001-durable-storage.md`) — **решение: оставаться на Blob**, БД не
подключаем. Следующий реальный шаг продукта — не PR 5 (тот теперь conditional,
только если сработает триггер из ADR), а либо: (а) сохранение слов + их
тренировка (SRS) поверх Blob, как расписано в ADR, либо (б) PR 6/Phase 7
(learning maps/adaptive ranking), когда до них дойдёт очередь по продуктовому
приоритету — обсудить с пользователем, что делать раньше, а не решать
автоматически по номеру PR в брифе.

## Текущий статус (2026-07-24): QA прогон + правки Bottom Sheet + редизайн ленты

Реальный QA (не просто "не упало", а смысловая проверка контента) на живом preview:
23 французских + 23 греческих токена через `/api/generate-annotation`, разобрано в
`QA_TESTING.md` §9/§9б. Найденные баги/недочёты исправлены в
`lib/pipeline/generateAnnotations.ts` (промпт-only правки, подтверждены повторным
прогоном на preview):
- **Баг**: `partOfSpeech` в тир 1 иногда расходился с тем, что называл текст объяснения
  в тир 2 (франц. "qui", греч. "να") — тир 2 больше не переопределяет часть речи текстом.
- Таблица **падеж×число** для существительных в языках с падежами (не только
  род×число для прилагательных).
- Таблица **значений** для предлогов/служебных слов с несколькими смыслами (греч.
  "από" = из/от/чем).
- Подсказка-связка (hint) теперь покрывает и грамматические конструкции без
  словослова-перевода (греч. "πιο μεγάλη"→"больше", "οι δύο"→"оба"), не только
  фиксированные словосочетания.
- Таблица **действ./страд. залог** для глагольных форм в маркированном залоге +
  правило "near-synonym note" (не путать "χτίζω" с "κατασκευάζω").
- Понижен порог для 4-й части глагольной структуры (управление предлогом) — с
  "жёстко зафиксировано" на "типично, часто".

Редизайн карточек ленты «Выбрать»: убран градиент-плейсхолдер (`.content-card-visual`),
эмодзи (новое обязательное поле `ContentCard.emoji`, 1-2 символа, тема+страна) встроено
в начало заголовка; кнопка «Читать» перенесена влево. Два существующих seed-заголовка
переписаны по новому правилу "называть место напрямую" (Санторини, Швейцария) — см.
`docs/content-system-v1.2/07_AI_CONTENT_GENERATION_PIPELINE.md` (добавлено туда же, это
правило для будущего Pipeline A, не только для seed-карточек).

**Что дальше (в процессе обсуждения с пользователем):**
- Сохранение слов + SRS-тренировка — план согласован (см. отдельную ветку обсуждения),
  начинать с миграции `localStorage` → Blob под `learning/v1/users/{userId}/...`,
  реализация ещё не начата.

## Текущий статус (2026-07-24): Pipeline A — генерация карточек (backend готов, не подключён к UI)

Реализована AI-генерация карточек-идей из тем×стран
(`07_AI_CONTENT_GENERATION_PIPELINE.md` §2), решённый размер пула — **~20 карточек за
прогон**, перегенерация — когда непоказанных карточек в отфильтрованном пуле остаётся
меньше ~8 (ещё не подключено к `useFeed`, это следующий шаг).

Новые файлы: `lib/pipeline/generateCards.ts` (AI-вызов, промпт с правилом "называть
место напрямую" + emoji-конвенция), `src/content-system/cardGenerationPipeline.ts`
(валидация AI-кандидатов против контролируемых словарей topic/country/format/
provenance — та же логика недоверия модели, что у `generateAnnotations.ts` к
LearningNode ids), `api/generated-cards.ts` (один эндпоинт: GET читает глобальный
Blob-пул, POST генерирует+валидирует+добавляет атомарно), `BlobGeneratedCardRepository`
+ `CompositeCardRepository` (склеивает seed из git и AI-пул за одним
`ContentCardRepository`), общий фильтр `cardQuery.ts` (переиспользован
`StaticSeedCardRepository`, чтобы seed и AI-карточки фильтровались одинаково).

**Три реальных бага поймано и исправлено первым же прогоном на preview** (полезная
иллюстрация, почему тестировать надо по-настоящему, не только `tsc --noEmit`):
1. **Vercel Hobby-план: не более 12 serverless-функций.** Проект уже был ровно на
   лимите (12 файлов в `api/`) — два новых файла Pipeline A вывели за лимит, деплой
   молча не публиковался (сборка проходила, публикация — нет). Решение: слили
   `app-preferences.ts`+`language-profiles.ts` в `api/user-state.ts`
   (`?kind=preferences|profiles`, они были почти идентичным Blob CRU когда read/write
   одного JSON per userId), и `generate-cards.ts` в `generated-cards.ts` (генерация и
   сохранение теперь один атомарный вызов вместо двух). Заодно `vercel.json` держит
   явный per-function `functions`-конфиг — его тоже нужно было обновить, иначе билд
   падает с "pattern doesn't match any Serverless Functions" даже после переименования
   файлов.
2. **Рантайм-краш (`FUNCTION_INVOCATION_FAILED`), не ловится локальным `tsc --noEmit`
   или `vite build`.** `cardGenerationPipeline.ts` импортировал `./catalog`/`./types`
   без `.js`-расширения — конвенция проекта требует явное расширение для всего, что
   реально исполняется как serverless-функция под Node ESM (см. как это уже сделано в
   `generateAnnotations.ts`). Локальный `npm run build` этого не ловит, потому что
   `api/*.ts` не входит в тот же `tsc -b` проход — только реальный вызов на preview
   вскрывает такие вещи.
3. **AI сгенерировал дубликат seed-карточки.** Первый настоящий прогон вернул
   `santorini-volcanic-rock-houses` — ровно тот же `canonicalSubjectKey`, что у
   `seed-003`, потому что сервер де-дупил только против своего собственного
   AI-пула, не против git-набора seed. Исправлено: эндпоинт подтягивает
   `canonicalSubjectKey` seed-карточек и передаёт их модели в списке "уже
   существующих идей" тоже.

После фиксов — два реальных прогона на preview (`el`, A2, разные темы/страны) дали
чистый, разнообразный результат: заголовки называют место напрямую (Мон-Сен-Мишель,
Афины, Крит, Родос, Эльзас, Берлин, Санторини, Швейцария), без повторов, схема
валидируется. **Осталось**: подключить триггер пополнения пула в `useFeed.ts` (когда
непоказанных карточек < 8 — вызывать `generateAndTopUp`), это следующий чекпоинт перед
тем, как Pipeline A реально попадёт в ленту пользователя.

## Текущий статус (2026-07-23): Storage Decision Gate — ADR-001 (остаёмся на Blob)

Прошли Storage Decision Gate из
`docs/content-system-v1.2/15_STORAGE_OPTIONS_AND_DATABASE_MIGRATION_PLAN.md`
§10-11 — не молча, а с явным обсуждением: пользователь подтвердил один
активный аккаунт (с двух устройств — комп и телефон, уже покрыто выбором
Blob-через-API в PR 1), готовность решать качественно сейчас без ожидания
метрик, что замеченная разница прод/локалка была конфигурационной (не
Blob-лимит), free-tier бюджет с Supabase как вероятным будущим кандидатом, и
прямой вопрос — выдержит ли Blob будущее сохранение слов + SRS-тренировку.

**Решение** (`docs/adr/ADR-001-durable-storage.md`, Accepted): остаёмся на
Vercel Blob для всего текущего и обозримого будущего функционала — включая
будущий SRS — пока не сработает явный триггер (второй реальный пользователь,
старт adaptive ranking, реальная — не гипотетическая — боль от Blob, нужда в
background jobs). Supabase зафиксирован как **предварительно выбранный**
кандидат на случай триггера, не подключается сейчас. PR 5 (реальная БД) из
мастер-брифа становится conditional на этот триггер, а не следующим
автоматическим шагом.

Попутно: `eventTrackingEnabled` (`src/content-system/featureFlags.ts`) сделан
переключаемым через `VITE_EVENT_TRACKING_ENABLED=true` в Vercel env
(Production/Preview) — можно включить трекинг в проде позже без code-правки,
когда пользователь реально начнёт пользоваться приложением (per его же
решение в этом же обсуждении). Дефолт не изменился — всё ещё dev-only, пока
переменная явно не выставлена.

Проверено: `tsc -b` чист после правки флага (markdown-файлы не требуют
сборки). Не коммичено/не запушено — ADR показан пользователю перед пушем
как архитектурное решение.

## Текущий статус (2026-07-23): Content System v1.2 — PR 4 (tracking experiment)

Клиентский трекинг событий поверх PR 1–3, без БД и без adaptive-использования
собранных данных:

- **`src/content-system/analytics/eventClient.ts`** — `track(name, payload,
  context?)`, no-op при `eventTrackingEnabled: false` (можно звать отовсюду
  без проверки флага на месте вызова). Очередь в памяти + persist в
  `localStorage` (`context-reader:v1:analytics-queue`), flush раз в 5с и на
  `visibilitychange`/`pagehide`, `anonymousSessionId` — per-tab
  `sessionStorage`. `getSessionEventLog()` — отдельный in-memory лог для
  debug-экрана, не зависит от того, дошёл ли flush до сервера.
- **`api/events-batch.ts`** — в отличие от `save-lesson`/`app-preferences`/
  `language-profiles`, это **не** read-modify-write индекса: каждый batch —
  новый immutable файл `events/v1/{userId}/{yyyy-mm-dd}/{batchId}.json`,
  `allowOverwrite: false`. `duplicateCount` всегда `0` — дедупликации нет,
  нет query-инфраструктуры (честно, не заявлено как реальное).
- **`analyticsEvent.ts`** — `EventName`/`AnalyticsEventPayloadMap` с ~22
  событиями (не весь каталог из `05` — только реально инструментированные).
- Инструментированы: навигация/shell (`global_language_changed`,
  `bottom_navigation_selected`, `settings_opened`, `topic_preferences_changed`,
  `country_preferences_changed`), feed (`feed_viewed` с честной классификацией
  `source` через refs предыдущего состояния, не постфактум-угадыванием;
  `card_impression` через реальный `IntersectionObserver`, не просто mount;
  `card_opened`, `feed_refreshed`), generation (`lesson_generation_*` в
  `cardGeneration.ts`), reader (`lesson_opened/started/progress/completed`,
  `token_tapped`, `annotation_details_opened`, `learning_unit_saved`,
  `sentence_translation_toggled`, `audio_started/paused/completed/speed_changed`).
- **Debug-экран** (`DebugEventsOverlay.tsx`, кнопка в `SettingsOverlay`, только
  `import.meta.env.DEV`) — сырой лог событий текущей сессии + «Скопировать
  JSON». Не полноценный dashboard из `05` §16 (там нужны learning-state/
  completion aggregates, которых ещё нет) — это и есть «debug journey» из
  брифа для PR 4, не больше.

**Сознательно не реализовано** (см. границы, заданные до старта агента):
- `feedback` (`⋯`-меню more_like_this/not_interesting/too_hard/…) — такого UI
  в продукте нет; строить новый видимый UX-элемент внутри трекинговой задачи
  без обсуждения с пользователем — нарушение конвенции проекта, не техническое
  ограничение.
- `card_dismissed` — нет UI отклонения карточки (ни свайпа, ни крестика).
- `lesson_abandoned` — документ прямо говорит вычислять его серверно (по
  `started` без `completed` за окно времени) — нет ни query, ни серверной
  обработки событий, реализовывать нечем.
- `audio_seeked` — в `NarrationPlayer.tsx` нет скраббера, действия нет.

**Приближения** (нет более точного сигнала в существующем коде, не новые
трекеры с нуля):
- `lesson_progress` — из уже существующего `progress` (доля пройденных
  word-токенов через `activeTokenId`), не отдельный трекер.
- `lesson_completed.activeReadingSeconds` — накопленное wall-clock время в
  `playbackStatus === 'playing'`, нет более тонкого сигнала «реально читает».
  `completionMethod` всегда `'reached_end'` — явной кнопки «отметить как
  прочитано» в плеере нет.
- `lesson_opened.entryPoint` — только `'generated_card'` (из card-flow) и
  `'library'` (sample/ручная генерация/открытие сохранённого); `'resume'`/
  `'deep_link'` не используются — для них нет ни одного реального пути в
  текущей навигации `App.tsx`, не выдуманы.
- `learning_unit_saved` — трекается только на реальное сохранение, не на
  снятие (в `05` нет отдельного имени события для «unsaved»).

`eventTrackingEnabled: import.meta.env.DEV` — собственное решение (по
аналогии с уже существующим `contentFeedEnabled`), не буквальное требование
документа; включение в проде — отдельный шаг для пользователя, не принято
молча.

Проверено: `tsc -b`/`oxlint`/`vitest run` (88 тестов, +8 на
`eventClient.ts`)/`npm run build` — чисто; `api/events-batch.ts` отдельно
проверен `tsc --noEmit` (не входит в `tsc -b`). **Не проверено без браузера**:
реальное поведение `IntersectionObserver` для `card_impression`, визуальный
вид debug-экрана и copy-to-clipboard вживую.

## Текущий статус (2026-07-23): Content System v1.2 — PR 3 (card → Lesson)

Поверх PR 2 реализован реальный переход «карточка → Lesson» вместо
inline-заглушки на кнопке «Читать»:

- **`src/content-system/blueprint.ts`** — `computeLessonId(cardId, language,
  targetLevel)` (детерминированный id вида `card-{cardId}-{language}-{level}`
  для идемпотентности) и `buildLessonBlueprint(card, language, targetLevel)`
  — собирает `LessonBlueprintData` из карточки: word-count bands по CEFR из
  `07` §4 (C1/C2 не описаны документом — экстраполированы, помечено в коде),
  маппинг `ContentFormat → {tone, discourseType, dialogueRatio?}`,
  `expectedDifficulty: 0.5` как честный placeholder (модели сложности ещё
  нет), `outline` — однострочный, взят прямо из описания карточки (реальный
  AI-outline — будущий Pipeline A, не эта задача).
- **`src/content-system/blueprintToPrompt.ts`** — адаптер blueprint →
  существующий `InputSource` (`{kind:'topic', prompt}`), `generateText.ts`
  не тронут вообще — просто собран content-rich topic-prompt на английском
  с цитированием русской идеи внутри.
- **`src/content-system/cardGeneration.ts`** (`generateLessonFromCard`) —
  оркестрация с идемпотентностью: повторный клик «Читать» по той же
  карточке/языку/уровню находит уже готовый урок и открывает его без
  повторной генерации; `creating`/`failed`-записи просто перезапускаются в
  тот же `lessonId` (самолечение зависших/упавших попыток), а не плодят
  дубликаты.
- **Статусы библиотеки**: `LessonSummary`/`LessonIndexEntry` получили
  `status: 'creating'|'ready'|'started'|'completed'|'failed'` (+`cardId?`,
  `blueprintId?`). Новый `api/lesson-status.ts` (`start`/`fail`, тот же
  read-modify-write паттерн, что в `save-lesson.ts`) пишет `creating`-
  placeholder до начала генерации и переводит в `failed` при ошибке; переход
  `creating → ready` делает уже существующий `api/save-lesson.ts` (минимально
  расширен — принимает `cardId`/`blueprintId`, подтягивает их из уже
  существующей записи, если не переданы явно). `started`/`completed` не
  реализованы — нет ещё `lastOpenedAt`/progress tracking, это отдельная
  будущая работа. Старые записи без `status` считаются `'ready'` (не ломаем
  старые lessons).
- `generateLessonPipeline.ts` — **единственное изменение**: опциональный
  `lessonId` в `options` (используется вместо `slugify(title)+Date.now()`,
  когда передан) + новая стадия прогресса `'starting'`. Ручной
  `GenerateLessonPage.tsx` не передаёт `lessonId` — его поведение не
  изменилось.
- `ContentCardTile`'s «Читать» теперь ведёт в `CardGenerationView.tsx`
  (переиспользует `GenerationProgress`) → на успехе открывает Reader, на
  ошибке — «Повторить» (идемпотентно, тот же `lessonId`). `LibraryPage`
  показывает `creating`/`failed` карточки отдельно (неактивные/с «Повторить»
  через `cardId`, если он есть — у записей из ручной генерации `cardId` нет,
  там просто лейбл без кнопки).

Собственное решение там, где бриф противоречил сам себе (единственное
разрешённое изменение в `generateLessonPipeline.ts` — только `lessonId` —
против «предпочтительного» варианта передавать `cardId`/`blueprintId` через
расширенную сигнатуру `saveLesson`, что потребовало бы трогать вызов внутри
пайплайна): `cardId`/`blueprintId` попадают в индекс не через проброс из
пайплайна, а потому что `api/save-lesson.ts` подтягивает их из уже
существующей `creating`-записи (которую `startLesson` создал до начала
генерации), если тело запроса их не передаёт.

Проверено: `tsc -b`/`oxlint`/`vitest run` (80 тестов, +9 на `blueprint.ts`)/
`npm run build` — чисто; `api/lesson-status.ts`/`api/save-lesson.ts`/
`api/app-preferences.ts`/`api/language-profiles.ts` дополнительно проверены
отдельным `tsc --noEmit` (эти файлы не входят в `tsc -b`/tsconfig.app.json).
**Не проверено**: реальный round-trip через `vercel dev` + Blob (нет
`BLOB_READ_WRITE_TOKEN`/browser в этой среде) и визуально — сам клик
Choose → генерация → Reader, retry на `failed`-записи в библиотеке.

**Не сделано намеренно**: полная `GenerationJob` state machine (07 §8, 12
стадий) — не нужна, пока флоу синхронный клиентский; статусы
`started`/`completed`; события/tracking — PR 4; recommendation-алгоритм —
Phase 7; БД по-прежнему не подключена.

## Текущий статус (2026-07-23): Content System v1.2 — PR 2 (mobile shell + feed)

Поверх PR 1 (repositories/contracts) реализован approved mobile shell по
`docs/content-system-v1.2/16_APPROVED_MOBILE_UX_AND_NAVIGATION.md`:

- **Bottom nav** (`BottomNav.tsx`) — 3 таба (Выбрать/Мои тексты/Учить),
  glass-стиль, `aria-current`, safe-area-aware; скрывается на Reader/Generate
  (это полноэкранные оверлеи вне таб-роутинга, `App.tsx` теперь хранит
  `{ tab }|{ kind:'generate', returnTo }|{ kind:'reader', returnTo }`, возврат
  ведёт в исходный таб).
- **TopBar** (`TopBar.tsx`) — глобальный `activeLanguage` + уровень, dropdown
  `role="listbox"`, кнопка настроек. `SettingsOverlay.tsx` — уровень по
  языкам + общие темы/страны (`content-system/catalog.ts`).
- **ChoosePage** (`ChoosePage.tsx` + `ContentCardTile.tsx`) — лента из 5
  карточек через `useFeed` → `StaticSeedCardRepository` (PR 1, читает
  seed JSON) → `content-system/feed.ts` `composeFixedFeed` — **детерминированный
  fixed slot composer, не recommendation-алгоритм** из `04` (тот — Phase 7,
  за `adaptiveRankingEnabled=false`). Hero крупнее без бейджа «Главная»,
  ровно 2 чипсы (provenance + длительность), CTA «Читать» видимый и
  кликабельный, но **не запускает генерацию** — показывает inline-уведомление
  «появится в следующем обновлении» (card → Lesson через blueprint — PR 3).
- **LibraryPage** — минимальный language-фильтр по `activeLanguage`
  (полноценный блок «Продолжить» по `lastOpenedAt`/статусам creating-ready-
  started-completed остаётся за PR 3 — этих персистентных полей ещё нет).
- **LearnPage** — shell по 16 §10 (CTA «Начать» decorative/disabled, SRS не
  реализован); фильтр сохранённых слов по языку сделан через join
  `lessonId → languageCode` (`BlobLessonArtifactRepository.listLessons()`),
  а не через добавление поля `language` в `SavedUnit` — чтобы не потребовалась
  миграция уже сохранённых unit'ов.
- Persistence `AppPreferences`/`LanguageProfile` — через Blob-adapters из
  PR 1 (`/api/app-preferences`, `/api/language-profiles`); если API
  недоступно (`npm run dev` без `vercel dev`), хуки используют дефолт в
  памяти сессии, не роняя экран.
- `GenerateLessonPage` (ручная генерация по своей теме) не удалён, остаётся
  достижим из Library («+ Новый урок») — параллельный путь к новой ленте,
  не заменяется ею.

Собственные решения там, где документ оставлял выбор: дефолт
`activeLanguage='fr'` (единственный полностью проверенный голос в проекте);
provenance-маппинг `adapted_article`/`current_event`/`user_text` → «На
основе источников» (в 16 §6 только 3 значения чипсы, схема ContentCard шире);
placeholder-изображения карточек — детерминированные градиенты по хэшу id
(не декоративные символы прототипа); флаг для English оставлен 🇬🇧 как
явно нерешённый по документу вопрос.

Проверено: `tsc -b`/`oxlint`/`vitest run` (53 теста, +6 на
`composeFixedFeed`)/`npm run build` — чисто; `npm run dev` поднимается,
модуль отдаётся без ошибок сервера. **Не проверено визуально в браузере**
(нет browser-инструмента в этой сессии) — стеклянные поверхности
(`backdrop-filter`/`color-mix()` в `src/styles/contentSystem.css`),
раскладка hero-карточки и контраст чипсов на плейсхолдерах не смотрены
глазами, стоит открыть в браузере на реальном узком viewport перед тем,
как считать PR 2 полностью принятым.

**Не сделано намеренно** (следующие шаги по брифу): card → Lesson через
`LessonBlueprint`, retry/idempotency, реальные статусы библиотеки — PR 3;
события/tracking — PR 4; recommendation-алгоритм/explainability — Phase 7;
никакая БД по-прежнему не подключена.

## Текущий статус (2026-07-23): Content System v1.2 — PR 1 (storage-independent foundation)

Начата новая большая подсистема поверх существующего ридера: лента из 5
рекомендованных карточек перед генерацией урока, скрытый learning plan,
детерминированный recommendation-алгоритм. Полный пакет ТЗ (18 файлов) и
финальный прототип (`context_reader_content_feed_prototype_v8.html`) — в
`docs/content-system-v1.2/` (ветка `content-system-docs-v1.2`). Реализация
идёт по порядку из `docs/content-system-v1.2/11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md`.

**Phase 0 (сделано):** `docs/content-system/IMPLEMENTATION_DISCOVERY.md` и
`STORAGE_DISCOVERY.md` — фактическое состояние репо до начала кода. Ключевая
находка: пакет документации описывает шаг «phrase group annotation» в
AI-пайплайне генерации, которого больше не существует (`markPhrases.ts` удалён
в Bottom Sheet v2, см. выше) — annotation теперь per-token, это не будет
воспроизводиться в новом коде.

**PR 1 (сделано):** контракты + repository interfaces, без UI и без БД —
- `src/content-system/types.ts`, `userTypes.ts`, `learningPlan.ts`,
  `analyticsEvent.ts` — Zod-схемы + TS-типы (`ContentCard`, `FeedItem`,
  `FeedBatch`, `AppPreferences`, `LanguageProfile`, `LessonBlueprintData`,
  `LearningNode`/`UserLearningNodeState` — только типы, repository для них
  будет в Phase 6). Zod — новая зависимость, выбрана по прямой рекомендации
  брифа («используй существующую schema library, если её нет — предпочти Zod»).
- `src/content-system/repositories.ts` — `AppPreferencesRepository`,
  `LanguageProfileRepository`, `ContentCardRepository`, `FeedRepository`,
  `LessonArtifactRepository`, `AnalyticsEventRepository`. `GenerationJobRepository`
  сознательно не введён — текущая генерация синхронная (progress callback),
  persistent job system по 06 §3.4 пока не нужен.
- `StaticSeedCardRepository` — читает `src/content-system/seeds/content-ideas.v1.json`
  (8 canonical-карточек, черновик на основе тем из prototype v8, **не
  финальный редакторский текст** — реальный набор 12–30 идей это задача
  content-writer агента, не архитектурного PR).
- `BlobLessonArtifactRepository` — тонкая обёртка над существующим
  `lessonsApi.ts` (`saveLesson`/`fetchLessonsIndex`), Lesson/audio Blob-flow
  не тронут. Сигнатура `saveLesson(lesson, audioUrl)` — намеренное отклонение
  от буквального контракта в доке (там `saveLesson(lesson)` без audioUrl):
  в реальном пайплайне аудио — не поле `Lesson`, а отдельный артефакт.
- `BlobAppPreferencesRepository`/`BlobLanguageProfileRepository` + новые
  serverless-эндпоинты `api/app-preferences.ts`, `api/language-profiles.ts` —
  Blob JSON per user (`app-state/v1/users/{userId}/...`), тот же
  read-modify-write паттерн, что уже есть в `api/save-lesson.ts`. Выбран
  **Blob через API**, а не localStorage — это рекомендованный в доке
  временный путь (cross-device), решение принято по умолчанию из документации,
  не отдельным пользовательским запросом. `LOCAL_USER_ID` — заглушка вместо
  реального userId, т.к. auth в проекте нет.
- Отклонение от буквального REST-пути `/api/language-profiles/:language`:
  в проекте нет dynamic-route файлов (`[param].ts`), поэтому язык передаётся
  в теле PATCH-запроса, а не в URL — минимальное совместимое изменение.
- `src/content-system/featureFlags.ts` — стартовые флаги, `contentFeedEnabled`
  включён только в dev, всё adaptive/tracking выключено.
- Тесты на `StaticSeedCardRepository` (`src/content-system/__tests__/`),
  `tsc -b`/`oxlint`/`vitest run`/`npm run build` — чисто.

**Не сделано намеренно** (следующие PR по брифу): UI (bottom nav, FeedPage,
global language selector) — PR 2; card → Lesson через blueprint — PR 3;
tracking/events — PR 4; никакая БД не подключена, ADR по storage не написан
(Storage Decision Gate — после PR 2–4).

## Текущий статус (2026-07-22): Bottom Sheet v2 — per-token клик

Редизайн по внешне подготовленному пакету `greek-bottom-sheet-handoff/`
(детали решения и найденный по ходу баг схемы OpenAI — decision record в
`AI_PIPELINE.md`, раздел «Bottom Sheet v2»). Повод: клик по слову внутри
многословной фразы (напр. «Μετά» в «Μετά το φαγητό») открывал объяснение
на всю фразу — не баг конкретной AI-разметки, а архитектура (`markPhrases.ts`
заранее группировал токены при генерации урока).

Изменение: `markPhrases.ts`/`api/mark-phrases.ts` удалены, каждый word-токен
теперь кликабелен независимо и всегда (`Annotation.id === token.id`
напрямую), связанная фраза вокруг слова решается внутри самого объяснения по
клику, а не заранее отдельным AI-шагом. Затронуло ~15 файлов сквозь весь
стек: типы (`src/types/lesson.ts`), промпты/схемы генерации
(`lib/pipeline/generateAnnotations.ts`), эндпоинт, клиентский пайплайн
генерации, рендер токенов (`InteractiveSentence.tsx`, упрощён — фразовая
группировка убрана целиком), хук выбора (`useSelectedAnnotation.ts`, ключ по
`token.id` напрямую), Bottom Sheet (`ExplanationSheet.tsx`, полностью
переписан — рендер по типизированным секциям `DetailSection[]`, а не по
фиксированным полям старой схемы).

**Осознанный чистый разрыв** (согласовано с пользователем): старые
сохранённые уроки (включая тестовый греческий) не мигрируются.
`src/data/sampleLesson.ts` лишился 26 ручных + автосгенерированных
аннотаций старой схемы — слова там теперь идут по тому же ленивому
AI-пути, что и у сгенерированных уроков (озвучка урока осталась статичной).

Проверено:
- `npm run build`/`lint`/`test` чисты (7 новых unit-тестов на перенесённый
  `isValidRelatedSpan` — валидация связанной фразы).
- Живой вызов `/api/generate-annotation` (оба тира) на эталонном предложении
  из хэндоффа «Η Άννα πήγε στον σταθμό.»: `πήγε` и `στον` — два независимых
  вызова с разным содержимым (главный критерий приёмки), `στον` корректно
  находит связанную фразу `στον σταθμό`, `πήγε` корректно её не показывает.
- По ходу этой проверки нашёлся и был исправлен реальный (не гипотетический)
  баг: OpenAI strict structured outputs отклоняет полиморфный `anyOf` по
  `const` без соседнего `type` — см. `AI_PIPELINE.md` для деталей фикса.

**Не проверено мной** — ручной клик в браузере (нет браузерного инструмента
в этой сессии): `vercel dev` поднят на `localhost:3000`, апи-уровень
(включая случай «два соседних бывших участника фразовой группы открывают
разные объяснения») подтверждён напрямую через `/api/generate-annotation`,
но фактический рендер `ExplanationSheet.tsx` (двухтировая подсветка,
`aria-expanded`, таблицы/bilingualPairs) визуально не открывался — стоит
сделать перед тем, как считать этап полностью принятым.

### Сверка с эталонами хэндоффа (вторая итерация)

После первой реализации сверили результат со ВСЕМИ 19 скриншотами в
`greek-bottom-sheet-handoff/screenshots/` (6 исходных jpg + 13 поздних png —
первый разбор ошибочно шёл только по 6, отсюда пропуски). Нашлось и починено:

- подсветка находила слово внутри другого слова (перевод «в» у `στην`
  подсвечивался в окончании «ресторано**в**») — теперь поиск по границам слова
  через `\p{L}/\p{N}` (`\b` не годится: он ASCII-only, а тут греческий + кириллица);
- заголовки секций были CAPS — прямой запрет §7 и критериев приёмки;
- таблицы подсвечивали строку с кликнутой формой — тоже прямой запрет;
- таблица могла прийти сеткой греческих форм вообще без переводов;
- `grammarNote` приходил **по-английски** — модель копировала английский пример
  из промпта дословно;
- структура шита отличалась от эталона: не было подписанной строки-связки под
  переводом, перевод был крупным акцентным (в эталоне — обычный текст), таблицы
  рендерились со строкой заголовков колонок (в эталоне её нет вообще),
  `grammarNote` был в серой плашке, «Подробнее» в одну строку, футер из трёх кнопок.

Два места, где эталоны противоречили друг другу, решены пользователем и
зафиксированы врезкой в начале `BOTTOM_SHEET_HANDOFF.md`: словарной формы
наверху нет; таблица времён — в лице «я».

**Новое в обиходе: `npm run audit:annotations`** (см. `AI_PIPELINE.md`) — прогон
реальных вызовов по каждому слову предложения с автопроверкой правил хэндоффа.
Оба последних бага (английский `grammarNote`, таблица без переводов) нашёл
именно он, а не глаз. Гонять после каждой правки промптов/схемы.

## Предыдущий статус (2026-07-22, до Bottom Sheet v2)

Озвучка переработана целиком («Озвучка v2» — decision record в
`AI_PIPELINE.md`, читать там подробности архитектуры). Повод: сравнение
OpenAI+Whisper vs ElevenLabs на живой генерации (не на рукописном
sample-уроке, как раньше) вскрыло два реальных бага и один системный
пробел, не точечно патчибельных:

- **découvrir звучал как couvrir** (озвучка слова в Bottom Sheet резалась
  по коартикуляции) и **pour не подсвечивался при чтении** — оба из-за
  одного и того же места: `mapCharactersToTokens` резал/терял токены на
  невалидных таймингах символов ElevenLabs (типично на лиэзонах).
- Внешний AI-аудит кода (прогнан пользователем на другом инструменте, текст
  подтверждён построчно сверкой с реальным кодом в этой сессии) указал на
  системный пробел: `unmatched` из выравнивания нигде не проверялся —
  урок сохранялся вслепую, даже если выравнивание было полностью сломано.

Решение — не патч, а слой: `lib/pipeline/timingRecovery.ts` (универсальный
recovery поверх сырых таймингов любого провайдера) + `lib/pipeline/
alignmentReport.ts` (quality gate — урок с плохим выравниванием теперь не
сохраняется молча, а отклоняется с человекочитаемой причиной). Заодно
ElevenLabs-путь переведён с двух вызовов (TTS + отдельный forced-alignment)
на один (`with-timestamps` — тайминги как побочный продукт синтеза, не
пост-анализ), озвучка слова в Bottom Sheet — с нарезки дорожки на отдельные
кэшируемые клипы (`api/speak-unit.ts`, тем же голосом, что и весь урок), и
заодно реализована мультиязычность (`fr|de|en|el` — контракт, голоса de/en/el
пока не проверены на слух, `AI_PIPELINE.md` знает про это явно).

Проверено (**всё пройдено, ничего не осталось открытым**):
- `npm run build`/`lint`/`test` чисты (27 новых unit-тестов — tokenize по
  4 языкам, mapCharactersToTokens на синтетическом découvrir/pour кейсе,
  timingRecovery, alignmentReport/quality gate).
- Регресс `npm run eval:alignment` на кэше — метрики идентичны прежним
  (127/127, p50 0.061s), перенос `computeCoverage` в `lib/pipeline/` и
  edge-snap фикс не сломали сравнение (на этой фикстуре edge-snap не сработал
  ни разу — там нет символов с невалидным таймингом, баг découvrir был на
  другом, сгенерированном тексте).
- Живые прогоны через `vercel dev` (реальная сеть, оба провайдера):
  - короткая синтетическая фраза на ElevenLabs → quality gate реально
    сработал и отклонил урок (422, доля восстановленных выше порога) —
    подтверждает, что gate не бутафория;
  - **полный CLI-прогон** (`scripts/generate-new-lesson.ts --provider=elevenlabs
    --language=fr`, реалистичный урок 176 слов, «Un dimanche à vélo dans
    Paris») — покрытие 100%, 174/176 слов напрямую от провайдера, только 2
    restretched, **quality gate пройден**. Ранний 422 на короткой фразе был
    артефактом нерепрезентативного текста, не проблемой архитектуры;
  - немецкий (`language=de`) через тот же `api/generate-audio.ts` — 8/8 слов
    напрямую, gate пройден — мультиязычный контракт реально работает по сети,
    не только типами;
  - OpenAI-путь (`api/generate-audio.ts` только TTS → `api/align-audio.ts`
    Whisper) — 11/11 слов напрямую, gate пройден;
  - SSRF-фикс — запрос с `audioUrl` на произвольный внешний хост отклонён
    (400), запрос на реальный Blob URL проходит;
  - `api/speak-unit.ts` — клип «découvrir» (то самое слово из бага) сгенерирован
    и закэширован: повторный запрос вернул тот же URL заметно быстрее, TTS не
    вызывался повторно.

Из известных ограничений: пороги quality gate (95% прямого покрытия / 10%
доли восстановленных) — первое приближение на глаз, не откалиброваны на
статистике; `AlignmentReport` теперь сохраняется в `Lesson.alignmentReport`
у каждого урока — материал для калибровки будет копиться сам. Голоса ElevenLabs
для de/en/el — те же voice_id, что у fr, не проверены на слух (`voiceVerified:
false`, видно в UI генерации предупреждением).

## Предыдущий статус (2026-07-21)

Переработка Bottom Sheet и режим перевода предложений завершены (Этапы A–D из
`BOTTOM_SHEET_WIP.md`) и влиты в рабочую ветку. Билд и линт чисты, проверено в браузере
на sample-уроке: двухтировый шит (клик → базовое объяснение, «Подробнее» → грамматика/формы),
подсветка целевого фрагмента в предложении, тост-заглушка озвучки для сгенерированных строк,
режим перевода предложений (тумблер в настройках, fixtures мгновенно, ленивый фетч для
сгенерированных уроков) и «Сохранить» (стаб на localStorage). Раньше ветка не собиралась —
причина (непереписанный `ExplanationSheet`) устранена.

### В процессе: audio-alignment eval (ElevenLabs Forced Alignment vs Whisper)

Ветка `claude/session-9k7o5i`. Контекст: до этого коммитом
`03039bf` (`claude/finish-file-work-nfr6cg`) был добавлен standalone-эксперимент
`evals/audio-alignment/` — сравнение точности таймкодов текущего продакшен-пути
(OpenAI TTS → Whisper → custom mapping, `src/data/lessonTimestamps.json`) с
ElevenLabs Forced Alignment на том же `public/audio/lesson-fr.mp3`. Ничего в приложении
не трогает (см. `evals/audio-alignment/README.md`).

Сделано в этой сессии (закоммичено, `dda47c7`):
- Первый прогон `npm run eval:alignment` дал 0/127 покрытия ElevenLabs — ложный
  «текст не совпадает». Причина: ElevenLabs возвращает `\r\n`, а `sentText` — `\n`
  (8 лишних символов на 4 разрывах абзацев). Пофикшено в
  `evals/audio-alignment/scripts/mapCharactersToTokens.ts` — теперь `\r` вычищается
  перед сравнением/индексацией (это не "угадывание позиций", а нормализация разницы
  в стиле переноса строк).
- Добавлены в `.gitignore`: результаты прогона (`comparison.json`,
  `elevenlabs-timestamps.json`, `whisper-timestamps.json`, `lesson-snapshot.json`,
  `report.md`) — регенерируются из `.cache/` за секунды, коммитить не нужно.
- Прогон сделан один раз, платный запрос к ElevenLabs выполнен и закэширован в
  `evals/audio-alignment/.cache/forced-alignment-raw.json` — **этот файл в
  `.gitignore`, в git не попал, существует только в контейнере этой сессии**.
  Результат прогона: полное покрытие (127/127 у обоих), start diff p50 0.061s /
  p95 0.24s / max 0.86s (слово «rentrer»). Самые крупные расхождения — в основном
  на коротких служебных словах (à, de, la, et) и ближе к концу урока
  (rentrer/passait/coucher).
- **Ручная проверка на слух ещё не сделана** — README прямо требует прослушать
  preview на 1× и 0.8×, переключая источник без перезапуска, прежде чем делать
  вывод (метрики — техническое совмещение, не гарантия естественности).
- Т.к. локального компа под рукой не было, вместо `npm run eval:alignment:preview`
  собрана полностью автономная HTML-копия превью (та же логика/CSS из
  `evals/audio-alignment/preview/`, но JSON-данные и сам mp3 вшиты как data URI —
  ничего не подгружает и не зависит от машины/контейнера) и опубликована как
  Artifact: **https://claude.ai/code/artifact/b66443c9-5a52-4d47-b324-ae0262c630e9**
  (файл-источник не в репозитории — это одноразовый снэпшот для просмотра,
  не переживёт эту сессию как редактируемый; при необходимости можно перегенерить
  тем же способом из закэшированного/пересчитанного `comparison.json` и т.д.).

**Открыто на момент паузы (решено в сессии 2026-07-22, см. «Текущий статус» выше):**
1. ~~Прослушать оба варианта в preview/artifact и решить, стоит ли ElevenLabs
   ощутимо естественнее Whisper~~ — решено: голос **Matilda**
   (`XrExE9yKIg1WjnnlVkGX`, `eleven_multilingual_v2`, `speed: 0.8` — нативный
   параметр синтеза, не тайм-стретч) выбран на слух пользователем из трёх
   кандидатов. ElevenLabs стал дефолтным провайдером в UI генерации
   (`GenerateLessonPage.tsx`), OpenAI+Whisper остаётся выбираемым fallback'ом.
2. ~~Если решение будет "нет"~~ / 3. ~~Если "да" — отдельный шаг миграции~~ —
   решено "да": миграция сделана целиком в этой сессии, не осталась
   гипотетической («Озвучка v2» в «Текущий статус» выше и в `AI_PIPELINE.md`).
   Код эксперимента (`evals/audio-alignment/`) остался в репо, но теперь
   переиспользует общий код прод-пайплайна (`lib/pipeline/mapCharactersToTokens.ts`,
   `lib/pipeline/alignmentReport.ts`) вместо своей копии.
4. При работе с другой машины: чтобы своими глазами перезапустить сам `npm run
   eval:alignment` (не только смотреть готовый artifact) — нужен свой
   `ELEVENLABS_API_KEY` в `.env` (кэш платного запроса из этой сессии никуда не
   передаётся, он не в git).

## Предыдущий статус (2026-07-19)

Этапы 0–4 реализованы и закоммичены. Прекомпилированный аудио-пайплайн реализован,
проверен вживую в браузере и закоммичен (был написан параллельно двумя сессиями
Claude Code одновременно — см. git log, финальная версия из сессии, которая довела его
до коммита после браузерной проверки). Провайдер TTS решён: **OpenAI**
(`gpt-4o-mini-tts`, голос `marin`) — ElevenLabs недоступен на бесплатном плане через API
(402 на library voices), пользователь решил не апгрейдить ради сравнения. Этап 5
(полировка и приёмка) не начат.

## Готово

- **Этап 0–1** — Vite + React 19 + TS скаффолд, статичный интерфейс ридера.
- **Этап 2** — интерактивные токены: клик по слову/фразе → Bottom Sheet, без скачков скролла.
- **Этап 3** — озвучивание, изначально через `BrowserSpeechAdapter` (Web Speech API):
  play/pause/stop, 5 скоростей, синхронная подсветка, «продолжить отсюда».
- **Этап 4** — полный французский текст A2–B1 с 26 аннотациями (`src/data/sampleLesson.ts`);
  затем доработка: фикс регулятора скорости (дропдаун вместо цикла по клику), «прыжок
  назад» при подсветке, редизайн действий в Bottom Sheet (иконки прослушивания рядом со
  словом + закреплённый футер).
- **Аудио-пайплайн (прекомпилированная озвучка)** — `scripts/generate-lesson-audio.ts`
  генерирует озвучку всего урока (`gpt-4o-mini-tts`, голос `marin`) и прогоняет через
  Whisper за word-level таймкодами; все 127 токенов сопоставлены без расхождений (merge-
  recovery для элизий/дефисов). `src/data/lessonTimestamps.json` подмешивается в
  `sampleLesson.ts` отдельным шагом. `PrecomputedAudioAdapter` заменил
  `BrowserSpeechAdapter` как основной (тот остаётся в кодовой базе как запасной вариант,
  тот же интерфейс `NarrationAdapter`). Проверено вживую в браузере: подсветка идёт
  секунда-в-секунду по реальным таймкодам, pause/rate change/переходы не сбрасывают
  позицию.
- Провайдер TTS решён: **OpenAI** (ElevenLabs недоступен на бесплатном плане через API —
  402 на library voices, пользователь решил не апгрейдить ради сравнения).
- Дефолтная скорость сгенерированной озвучки: числовой `speed` параметр пробовали (0.85) —
  звучит неестественно (тайм-стретч, фидбек на слух), откатили. Вместо этого в `instructions`
  прямо просим модель говорить чуть медленнее и разборчивее — настоящая медленная речь, не
  постобработка. UI-регулятор скорости (0.6–1.5×) работает поверх этого при воспроизведении.
- **AI-генерация Bottom Sheet контента** — `scripts/generate-annotations.ts` по шаблону из
  `AI_PIPELINE.md` (полное предложение как контекст, строгий JSON-schema-ответ) сгенерировал
  объяснения для всех 78 слов урока без ручной аннотации (включая служебные — пользователь
  явно попросил без исключений), `gpt-4o`. Результат — `src/data/generatedAnnotations.json`,
  подмешан в `sampleLesson.ts` отдельным слоем поверх 26 ручных аннотаций (не заменяя их).
  Резюмируемо: скрипт пропускает уже сгенерированное при повторном запуске — пригодилось
  после rate limit (30k TPM) на середине первого прогона, докатили с concurrency=2.
  Проверено в браузере — весь текст урока теперь полностью аннотирован.
- Черновик архитектуры AI-пайплайна зафиксирован в `AI_PIPELINE.md`.
- **Входной пайплайн v1 (французский, локальный CLI)** — `scripts/generate-new-lesson.ts` +
  `scripts/lib/pipeline/*` реализуют полный план из архива plan-файла: материал/тема →
  AI-текст → детерминированная токенизация → AI-разметка фраз (новый шаг, раньше делался
  только вручную) → AI-объяснения → TTS+Whisper таймкоды → готовый `Lesson`. Спроектировано
  мультиязычно-готово (`LanguageConfig` — единственная точка про конкретный язык, сейчас
  только `fr`), но реализовано и проверено только на французском — по решению пользователя.
  Валидационный прогон (`--topic="Un petit-déjeuner au marché"`, ~110 слов): связный текст,
  3 корректные фразовые группы, 90/90 аннотаций без сбоев, аудио-выравнивание — 1 неточность
  из ~93 токенов, структурная проверка целостности данных — чисто. Результат пишется в
  `scripts/output/*.json` (гитигнорится, черновик для ручной проверки) — **не подключено в
  приложение**, backend/входной UI — следующий, ещё не начатый шаг.

## Дальше (кандидаты, порядок не зафиксирован)

1. **Backend + входной UI** для пайплайна из п. выше — обернуть `scripts/lib/pipeline/*` в
   Vercel serverless route(ы) и построить экраны материал → настройки → результат. Пайплайн
   как логика уже проверен локально; это следующий отдельный шаг (сериализация в async job —
   полный прогон занимает минуты, не секунды, — плюс сам UI).
2. ~~**Мультиязычность** (de/en/el)~~ — контракт реализован в сессии 2026-07-22
   (`lib/pipeline/languageConfig.ts` — все 4 языка, `tokenize.ts` на
   `Intl.Segmenter`, `language` прокинут во все `api/*`). Голоса de/en/el
   работают технически (живьём проверено на немецком), но **не проверены на
   слух** — следующий шаг тут не архитектурный, а «сесть и послушать»,
   как в своё время делалось для fr (`scripts/generate-audio-sample.mjs`).
3. **Этап 5** — мобильная/десктопная проверка, клавиатура (Space/Escape), доступность,
   `prefers-reduced-motion`, fallback при недоступном TTS/аннотации, сверка с чек-листом
   приёмки (26 пунктов из ТЗ в `PLAN.md`).

## Открытые вопросы (перенесены из AI_PIPELINE.md, ещё не решены)

- Какой AI-провайдер для генерации текста/грамматики (может отличаться от TTS-провайдера
  — OpenAI для TTS уже решён, но текстовая генерация не обязана быть тем же вендором).
- Как автоматически определять, какие слова/фразы достойны аннотации в НОВОМ, ещё не
  написанном человеком тексте (сейчас разметка полностью ручная; для текущего фиксированного
  урока это не проблема, но для входного пайплайна — открытый вопрос).

## Как поддерживать этот файл в актуальном состоянии

- При завершении этапа из `PLAN.md`: переносить его из «Дальше» в «Готово» одной строкой
  со ссылкой на суть изменений (не дублировать код/детали — они в git log и в коде).
- При старте нового куска работы, который переживёт одну сессию: добавлять в
  «В процессе» с пометкой, что закоммичено, а что нет.
- При принятии решения, которое не очевидно из кода (выбор провайдера, отказ от
  варианта, компромисс по UX): записывать здесь или в `AI_PIPELINE.md`/`DESIGN.md`
  (где решения по архитектуре/визуалу уже фиксируются) — с чем сравнивали и почему.
- Не дублировать `PLAN.md`/`DESIGN.md`/`AI_PIPELINE.md` — этот файл про **текущее
  состояние**, те — про **план и зафиксированные решения**.
