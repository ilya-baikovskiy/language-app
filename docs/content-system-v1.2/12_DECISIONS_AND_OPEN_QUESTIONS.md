# Зафиксированные решения и открытые вопросы

## Зафиксировано

### Product

- основной опыт — короткое интересное чтение, а не видимый курс;
- feed снимает необходимость каждый раз придумывать тему;
- материалы: примерно 30 секунд — 3 минуты;
- canonical ideas готовятся заранее, полный Lesson — только после выбора;
- первая карточка — editorial hero без badge `Главная`;
- выбранный Lesson автоматически появляется в библиотеке;
- feedback не навязывается;
- hidden plan не показывается как mastery/progress course;
- обязательная база влияет на предложения, но не блокирует выбор;
- SRS отдельно.

### Mobile navigation

- три нижние вкладки: `Выбрать`, `Мои тексты`, `Учить`;
- floating glass bottom bar;
- Reader не является вкладкой и скрывает bottom nav;
- settings остаются в top bar.

### Global language

- один `activeLanguage` управляет feed, library и learn;
- selector в шапке: emoji flag + language + level;
- flags не используются на карточках;
- нет `Текущий язык / Все`;
- library и learn не смешивают языки;
- Reader использует language/level snapshot конкретного урока.

### Feed/card UI

- заголовок `Что почитаем?`, без subtitle;
- убрать `Сегодня`, `5 идей`, catalogue и объяснение генерации;
- feed/library titles — на русском для быстрого сканирования;
- Reader title — на языке урока + русский перевод;
- description — на русском;
- `В тексте` — часть того же абзаца и того же цвета;
- на image только provenance + duration chips;
- не дублировать country, duration, language, level и format рядом с title;
- изображения остаются и позднее генерируются AI в единой визуальной системе.

### Topics/countries

- темы глобальны для всех языков;
- countries/regions глобальны для всех языков;
- язык Lesson независим от страны материала;
- одна canonical idea может быть адаптирована для любого поддерживаемого языка/уровня;
- настройки находятся в settings, не на main feed;
- изменения не удаляют существующие Lessons.

### Library/Learn

- library показывает только active language;
- `Продолжить` определяется по `lastOpenedAt`, не по максимальному progress;
- old lesson сохраняет level snapshot;
- lesson идентифицируется `lessonId`, не title;
- Learn показывает только saved units active language;
- реальный SRS не входит в content-feed MVP.

### Language goals

- German/French: simple reading;
- Greek: A2 → B1;
- English: thematic breadth + natural constructions.

### Storage

- постоянной базы пока нет и provider не выбран;
- Vercel Blob остаётся текущим хранилищем Lesson/audio/artifacts;
- seed canonical cards могут храниться в versioned JSON в Git;
- product/domain код работает через repository interfaces;
- localStorage допустим для UI/cache и временного personal prototype;
- adaptive ranking не включается до durable event/state storage;
- PostgreSQL/managed relational database — кандидат, а не решение.

### Recommendations

- deterministic weighted ranking;
- five-slot composer;
- explainability;
- level trials only with explicit confirmation.

## Актуальные источники истины

1. `16_APPROVED_MOBILE_UX_AND_NAVIGATION.md`;
2. `_prototype_reference/context_reader_content_feed_prototype_v8.html`;
3. остальные документы пакета;
4. существующие product/reader документы и код репозитория.

Прототип — reference поведения и иерархии, не production component library.

## Открыто, но не блокирует MVP

1. финальная AI image visual direction;
2. как часто готовить новые canonical cards;
3. какой provider использовать для source discovery;
4. нужен ли progressive lesson opening;
5. нужна ли база до production-релиза ленты или достаточно Blob/JSON для personal MVP;
6. какой durable storage выбрать после эксперимента;
7. auth модель первого production release;
8. внешний analytics provider;
9. imported user text и learning state;
10. cooldown после `not_interesting`;
11. weekly insight без gamification;
12. deep links на урок другого языка;
13. нужен ли когда-либо mixed-language archive;
14. выбор flag для English;
15. реальный SRS и review UX;
16. production typography/design tokens.

## Перед adaptive ranking решить

- minimum evidence count;
- decay function;
- mandatory nodes per language;
- normalization taps by level/text length;
- audio-first evidence;
- details curiosity vs confusion;
- level trial threshold;
- handling of rereads;
- влияние глобальных topic/country preferences;
- cross-language reuse одной canonical idea.

## Decision log template

```md
## YYYY-MM-DD — Решение

### Контекст

### Решение

### Почему

### Альтернативы

### Последствия

### Пересмотреть, если
```
