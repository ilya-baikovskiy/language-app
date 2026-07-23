# Context Reader — Content Feed, Mobile App Shell & Hidden Learning Plan

## Назначение пакета

Версия 1.2 пакета описывает следующую крупную часть Context Reader: откуда берутся идеи материалов, как пользователь получает ленту интересных карточек, как выбранная карточка превращается в полноценный `Lesson`, как система незаметно ведёт пользователя по языковому плану, какие данные нужно собирать и где их хранить.

Документы рассчитаны на Claude Code, который будет работать внутри существующего проекта, а не строить приложение с нуля.

## Что уже существует и не должно быть переписано без необходимости

Перед реализацией Claude обязан изучить:

1. `PRODUCT_OVERVIEW.md`;
2. `01_product_learning_ux.md`;
3. актуальные `PLAN.md`, `DESIGN.md`, `AI_PIPELINE.md`, `PROGRESS.md`;
4. текущий `Lesson` contract;
5. reader, библиотеку, Bottom Sheet и sentence translation mode;
6. существующий AI/TTS pipeline;
7. Vercel Blob storage и quality gate таймингов.

Новый слой должен расширять текущий путь:

```text
идея материала → карточка → выбор → генерация Lesson → reader → события → следующая подборка
```

## Принятые решения

- Основной пользовательский опыт — короткое интересное чтение, а не прохождение курса.
- Полный урок создаётся только после выбора карточки.
- Карточки и источники можно готовить заранее, чтобы при входе не ждать.
- Большая карточка — самая интересная рекомендация среди подходящих по уровню и качеству; отдельная метка `Главная` не показывается.
- Mobile app имеет три нижние вкладки: `Выбрать`, `Мои тексты`, `Учить`; Reader открывается отдельно.
- Один глобальный активный язык управляет feed, library и learn.
- Feed/library используют русские editorial titles; Reader показывает title на языке урока и русский перевод.
- Темы и страны общие для всех языков; canonical idea может быть адаптирована на любой поддерживаемый язык и уровень.
- Учебный план скрыт и управляет ассортиментом, сложностью и покрытием, но не блокирует выбор.
- Один текст не означает, что тема или грамматика «пройдена».
- Повторение отдельных сохранённых слов и SRS — отдельный будущий модуль.
- Пользователь сам задаёт уровень языка; приложение может предложить пробный материал следующего уровня, но не меняет уровень молча.
- Первая версия алгоритма — объяснимая эвристика, а не ML-рекомендер.
- Постоянной базы данных в проекте пока нет; конкретный провайдер и тип базы ещё не выбраны.
- Сначала вводятся storage/repository contracts, чтобы продуктовая логика не зависела от конкретного хранилища.
- Первую версию ленты можно реализовать на seed JSON + существующем Vercel Blob, без подключения базы.
- Полные Lesson JSON, mp3 и другие тяжёлые артефакты остаются в Vercel Blob.
- localStorage допустим для UI state, cache и временной очереди событий, но не должен стать единственным долгосрочным источником данных.
- До adaptive ranking нужно отдельно принять решение о durable structured storage и задокументировать его в ADR.

## Цели по языкам

| Язык | Старт | Цель |
|---|---:|---|
| Немецкий | A0–A1 | научиться читать короткие простые тексты |
| Французский | A0–A1 | научиться читать короткие простые тексты |
| Греческий | A2 | постепенно выйти на B1 |
| Английский | B1–B2 | расширять тематический словарь, устойчивые конструкции и приближать восприятие к естественному |

## Термины

### `ContentCard`

Дешёвая заранее подготовленная canonical идея материала. Не принадлежит одному языку и не содержит полного текста, аудио и аннотаций.

### `LessonBlueprint`

Структурированный план будущего урока: тема, формат, источники, уровень, учебные узлы, ограничения по стилю и сложности.

### `Lesson`

Существующая сущность reader: текст, предложения, токены, аннотации, переводы, аудио, тайминги и отчёт качества.

### `LearningNode`

Атом скрытого учебного плана: коммуникативная ситуация, лексическая область, грамматическая конструкция, тип дискурса или навык чтения.

### `Evidence`

Сигнал поведения пользователя, который помогает оценить интерес, сложность и покрытие.

### `FeedBatch`

Конкретная пятёрка карточек, показанная пользователю в определённый момент.

## Порядок чтения документов

1. `01_IDEAL_PRODUCT_VISION.md`
2. `02_CONTENT_CATALOG_AND_CARD_SYSTEM.md`
3. `03_HIDDEN_LEARNING_PLAN.md`
4. `04_RECOMMENDATION_ALGORITHM.md`
5. `05_TRACKING_EVENTS_AND_METRICS.md`
6. `06_DATA_MODEL_AND_STORAGE.md`
7. `07_AI_CONTENT_GENERATION_PIPELINE.md`
8. `08_FRONTEND_UX_AND_STATES.md`
9. `09_TESTING_EVALUATION_AND_GUARDRAILS.md`
10. `10_MVP_ROADMAP_AND_ACCEPTANCE_CRITERIA.md`
11. `11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md`
12. `12_DECISIONS_AND_OPEN_QUESTIONS.md`
13. `13_LANGUAGE_LEARNING_MAP_BOOTSTRAP.md`
14. `14_SOURCE_REGISTRY_AND_EDITORIAL_POLICY.md`
15. `15_STORAGE_OPTIONS_AND_DATABASE_MIGRATION_PLAN.md`
16. `16_APPROVED_MOBILE_UX_AND_NAVIGATION.md` — актуальный источник истины для mobile UX
17. `_prototype_reference/README.md` и prototype v8

## Рекомендуемый порядок реализации

```text
1. Инвентаризация текущего репозитория и существующего Blob flow
2. Shared domain contracts и repository interfaces — без выбора базы
3. Временные adapters: seed JSON / existing Blob / local UI cache
4. App preferences + language profiles + глобальный language selector
5. Mobile shell: glass bottom nav, fixed feed и language-scoped library/learn
6. Card → existing generation pipeline
7. Минимальный tracking в immutable event batches
8. Отдельный Storage ADR: нужна ли база, какая и на каком этапе
9. Durable event store и debug UI
10. Learning nodes и derived state
11. Adaptive ranking за feature flag
12. Level trials
13. Source registry и автоматическая подготовка карточек
```

**Claude не должен подключать PostgreSQL или писать migrations в первом PR, пока отдельное решение о базе не принято.** Подробности — в `15_STORAGE_OPTIONS_AND_DATABASE_MIGRATION_PLAN.md`.

## Главный принцип

> Не вести пользователя по списку уроков, а собирать интересную ленту внутри контролируемого языкового пространства.

## Актуальный визуальный reference

Использовать `_prototype_reference/context_reader_content_feed_prototype_v8.html` вместе с `16_APPROVED_MOBILE_UX_AND_NAVIGATION.md`. Не копировать prototype JavaScript как production architecture.
