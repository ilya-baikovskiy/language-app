# События, трекинг и метрики

## 1. Задачи трекинга

1. Проверить, хочется ли возвращаться к чтению.
2. Отличить интерес от сложности.
3. Обновлять скрытый план.
4. Отлаживать recommendation algorithm.

## 2. Принципы

- tap не равен save;
- долгое чтение не всегда хорошо;
- details не всегда означает затруднение;
- один пропуск карточки ничего не доказывает;
- raw events immutable;
- derived state пересчитывается;
- schema версионируется;
- event ingestion идемпотентен.

## 3. Статус постоянного хранения событий

Постоянная база пока не подключена. Поэтому нужно разделять:

- **event contract и instrumentation** — можно реализовать сразу;
- **durable event ingestion** — зависит от отдельного решения по storage;
- **adaptive learning-state updates** — нельзя включать как надёжную production-функцию, пока события не сохраняются устойчиво и не проверена дедупликация.

Для личного MVP допустим временный `BlobEventRepository`, который сохраняет каждый batch отдельным immutable JSON-файлом. Не создавать один общий изменяемый `events.json`.

Если durable store ещё не выбран, feature flags должны позволять:

```text
eventTrackingEnabled=true
adaptiveRankingEnabled=false
learningStateUpdatesEnabled=false
```

Подробнее — `15_STORAGE_OPTIONS_AND_DATABASE_MIGRATION_PLAN.md`.

## 4. Event envelope

```ts
export interface AnalyticsEvent<TPayload = unknown> {
  id: string;
  schemaVersion: number;
  userId: string;
  anonymousSessionId: string;
  language?: LanguageCode;
  lessonId?: string;
  cardId?: string;
  feedBatchId?: string;
  name: EventName;
  occurredAt: string;
  receivedAt?: string;
  client: {
    platform: 'web';
    appVersion: string;
    viewport?: string;
    locale?: string;
  };
  payload: TPayload;
}
```

## 5. App shell и navigation events

### `global_language_changed`

```ts
{
  fromLanguage: LanguageCode;
  toLanguage: LanguageCode;
  fromLevel: CEFRLevel;
  toLevel: CEFRLevel;
  currentTab: 'choose' | 'library' | 'learn';
}
```

### `bottom_navigation_selected`

```ts
{
  fromTab: 'choose' | 'library' | 'learn';
  toTab: 'choose' | 'library' | 'learn';
}
```

### Settings

- `settings_opened`;
- `language_level_changed`;
- `topic_preferences_changed`;
- `country_preferences_changed`.

Payload изменений preferences должен содержать added/removed ids, но не отправлять лишний PII.

## 6. Feed events

### `feed_viewed`

```ts
{ itemCount: number; selectedLevel: CEFRLevel; source: 'app_open' | 'language_switch' | 'refresh' | 'settings_change' }
```

### `card_impression`

Отправлять только при реальной видимости.

```ts
{ position: number; slot: FeedSlot; isHero: boolean; impressionDurationMs?: number }
```

### `card_opened`

```ts
{ position: number; slot: FeedSlot; timeSinceFeedViewMs: number }
```

### `card_dismissed`

```ts
{ reason?: 'not_interesting' | 'already_know' | 'not_now' }
```

### `feed_refreshed`

```ts
{ previousBatchId: string }
```

## 7. Generation events

- `lesson_generation_requested`;
- `lesson_generation_stage_started`;
- `lesson_generation_stage_completed`;
- `lesson_generation_failed`;
- `lesson_generation_completed`.

Payload:

- jobId;
- cardId;
- blueprintId;
- provider/model;
- stage;
- duration;
- retryCount;
- errorCode.

## 8. Reader events

### `lesson_opened`

```ts
{ entryPoint: 'generated_card' | 'library' | 'resume' | 'deep_link'; currentProgress: number; appActiveLanguage: LanguageCode; lessonLanguage: LanguageCode }
```

### `lesson_started`

Первый meaningful interaction: scroll, play или минимальная активная задержка.

### `lesson_progress`

Milestones: 10, 25, 50, 75, 90, 100%. Не отправлять каждый scroll.

### `lesson_completed`

```ts
{
  completionMethod: 'reached_end' | 'explicit_button';
  activeReadingSeconds: number;
  elapsedSeconds: number;
}
```

### `lesson_abandoned`

Лучше вычислять серверно по started без completed после окна времени.

## 9. Learning interactions

### `token_tapped`

```ts
{
  tokenId: string;
  sentenceId: string;
  annotationType: 'word' | 'phrase';
  repeatedInLesson: boolean;
}
```

### `annotation_details_opened`

```ts
{ tokenId: string; timeSinceSheetOpenMs: number }
```

### `learning_unit_saved`

```ts
{ tokenId: string; unitType: 'word' | 'phrase' }
```

### `sentence_translation_toggled`

```ts
{ enabled: boolean; scope: 'lesson'; currentProgress: number }
```

Audio:

- `audio_started`;
- `audio_paused`;
- `audio_completed`;
- `audio_speed_changed`;
- `audio_seeked`.

## 10. Feedback

```ts
interface LessonFeedbackPayload {
  feedback:
    | 'more_like_this'
    | 'not_interesting'
    | 'too_hard'
    | 'too_easy'
    | 'too_school_like'
    | 'bad_audio'
    | 'factual_issue';
  optionalComment?: string;
}
```

Feedback спрятан за `⋯` и не обязателен.

## 11. Derived metrics

### Интерес

- card open rate;
- hero open rate;
- completion по теме/формату;
- more-like-this rate;
- dismiss rate;
- time to select;
- return to similar content.

### Сложность

- taps per 100 words;
- unique tapped tokens per 100;
- repeated tap rate;
- details rate;
- translation dependency;
- active reading seconds per 100 words;
- early abandonment;
- explicit hard/easy feedback.

### Привычка

- active reading days/week;
- lessons started/completed;
- D1/D3/D7 return;
- resumed lessons;
- median session.

### Покрытие

- exposed learning nodes;
- mandatory nodes with evidence;
- topic diversity;
- format diversity;
- successful level trials.

## 12. Стартовые эвристики

```text
difficulty =
  0.30 * normalized_taps_per_100
+ 0.15 * repeated_tap_rate
+ 0.15 * details_rate
+ 0.20 * translation_dependency
+ 0.20 * early_abandonment
```

```text
comfort =
  0.45 * completion
+ 0.20 * low_tap_score
+ 0.15 * low_translation_dependency
+ 0.10 * normal_reading_pace
+ 0.10 * explicit_too_easy_or_successful_trial
```

Это диагностируемые MVP-эвристики, не научно доказанные формулы.

## 13. Интерпретации комбинаций

| Поведение | Рабочая гипотеза |
|---|---|
| открыл, много taps, дочитал | интересно, но сложно |
| не открыл | неизвестно: тема, заголовок или момент |
| открыл и быстро бросил, мало taps | скучно или плохой текст |
| много details + saves | высокий учебный интерес |
| мало taps + too_easy | добавить challenge |
| перевод на почти весь текст | слишком сложно |

## 14. Event delivery

- клиентская очередь;
- batch flush каждые несколько секунд;
- flush на `visibilitychange`;
- UUID на клиенте;
- дедупликация по event id в выбранном repository;
- retry безопасен;
- localStorage для временной очереди.

## 15. Privacy

- не класть полный пользовательский текст в analytics;
- не класть API keys в client;
- возможность удаления пользовательских данных;
- feedback comments хранить отдельно и явно;
- минимизировать PII.

## 16. Debug dashboard

Нужен внутренний экран:

- feed batches;
- показанные карточки;
- выбранная карточка;
- slot и reason codes;
- completion;
- taps/100;
- translation usage;
- feedback;
- learning state до/после.

Без этого adaptive algorithm нельзя качественно настраивать.

### Дополнительные UX-метрики v8

- language changes per session;
- sessions ending without card selection;
- time to choose a card;
- resume-card open rate;
- choose/library/learn tab frequency;
- saved-units growth per language;
- Russian-title card open rate baseline;
- cross-language reuse of the same canonical subject.
