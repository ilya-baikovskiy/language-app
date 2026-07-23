# Алгоритм рекомендаций и сборка ленты

## 1. Цель MVP

Первая версия должна быть объяснимой и детерминированной. ML-рекомендер не нужен. Любая карточка в ленте должна иметь сохранённое объяснение: какой slot она занимает, какие scores получила и почему не была отфильтрована.

## 2. Вход

```ts
interface FeedRequestContext {
  userId: string;
  language: LanguageCode;
  selectedLevel: CEFRLevel;
  now: string;
  languageProfile: LanguageProfile;
  learningState: UserLearningNodeState[];
  recentEvents: AnalyticsEvent[];
  recentFeedHistory: FeedHistoryItem[];
  candidateCards: ContentCard[];
}
```

## 3. Eligibility filters

Исключить карточку, если:

- язык не совпадает;
- уровень слишком далёк;
- factual card просрочена;
- quality ниже порога;
- source metadata невалидна;
- карточка слишком часто показывалась недавно;
- lesson уже создан и не допускает reread;
- источник выключен;
- это продолжение непрочитанной серии;
- действует explicit cooldown после `not_interesting`;
- нет нужного blueprint contract version.

## 4. Score

Стартовая формула:

```text
score =
  0.35 * interest_fit
+ 0.25 * level_fit
+ 0.18 * learning_gap_value
+ 0.10 * diversity_value
+ 0.07 * freshness_value
+ 0.05 * exploration_value
- repetition_penalty
- difficulty_risk
- quality_penalty
```

Веса — конфигурация и гипотеза, а не истина.

## 5. Компоненты

### `interest_fit`

Использует:

- выбор похожих тем;
- completion похожих форматов;
- `more_like_this`;
- регионы;
- длину;
- provenance;
- explicit interests.

Cold start использует цели языка и общий продуктовый prior.

### `level_fit`

Учитывает:

- target level;
- ожидаемую длину;
- синтаксическую сложность;
- discourse type;
- количество новых конструкций;
- абстрактность.

### `learning_gap_value`

Высокий для:

- mandatory node с низким coverage;
- узла, давно не встречавшегося;
- prerequisite;
- области, важной для цели языка.

Не должен побеждать интерес любой ценой.

### `diversity_value`

Повышается, если карточка отличается от недавних по теме, формату, региону, provenance, discourse и длине.

### `freshness_value`

Важен для новостей и сезонных материалов. Для evergreen почти нулевой.

### `exploration_value`

Позволяет иногда показывать новую тему, новый формат или чуть более сложный материал.

## 6. Slot composer

Пять top-score карточек могут оказаться одинаковыми, поэтому ranking дополняется slot composition.

### Slot A — `hero_interest`

- максимальный interest fit;
- высокий level fit;
- quality pass;
- не была hero недавно.

### Slot B — `learning_gap`

- покрывает underexposed learning nodes;
- остаётся привлекательной;
- не выглядит как наказание.

### Slot C — `mandatory_foundation`

- фундаментальная область;
- особенно важна для de/fr A0–A2;
- учебная цель обёрнута в нормальную историю.

### Slot D — `diversity`

- максимальное отличие от недавнего чтения;
- может иметь не самый высокий общий score.

### Slot E — `stretch_or_fresh`

- next-level trial;
- либо свежий source-based материал;
- выбор зависит от профиля языка.

## 7. Ограничения подборки

- карточка занимает только один slot;
- не более двух одинаковых форматов;
- не более двух карточек одной широкой темы;
- минимум одна история, если доступна;
- минимум одна factual/cultural card, если доступна;
- selected cards пересчитывают diversity для следующих slots.

## 8. Псевдокод

```ts
function buildFeed(ctx: FeedRequestContext): FeedBatch {
  const eligible = filterCandidates(ctx);
  const scored = eligible.map(card => scoreCard(card, ctx));
  const selected: RankedFeedItem[] = [];

  for (const slot of [
    'hero_interest',
    'learning_gap',
    'mandatory_foundation',
    'diversity',
    'stretch_or_fresh'
  ] as const) {
    const item = selectBestForSlot(slot, scored, selected, ctx);
    if (item) selected.push(item);
  }

  return persistFeedBatch(dedupeAndBackfill(selected, scored, ctx), ctx);
}
```

## 9. Explainability

```ts
interface RecommendationExplanation {
  slot: FeedSlot;
  totalScore: number;
  components: {
    interestFit: number;
    levelFit: number;
    learningGapValue: number;
    diversityValue: number;
    freshnessValue: number;
    explorationValue: number;
    penalties: number;
  };
  reasonCodes: string[];
  matchedLearningNodeIds: string[];
}
```

Reason codes:

- `LIKED_SIMILAR_CULTURE`;
- `UNDEREXPOSED_HOUSING`;
- `LEVEL_FIT_HIGH`;
- `NEW_FORMAT`;
- `TRIAL_NEXT_LEVEL`;
- `FRESH_SOURCE`;
- `RECENT_REPEAT_PENALTY`;
- `MANDATORY_FOUNDATION`.

## 10. Cold start

При отсутствии данных:

- использовать goal profile;
- базовую карту уровня;
- максимальное разнообразие;
- не персонализировать слишком рано;
- собирать первые signals.

Пример немецкого A1:

1. спокойная история;
2. практическая сцена;
3. культурный факт;
4. место;
5. обязательная область.

## 11. Feedback semantics

### `more_like_this`

Увеличивает preference темы, формата, региона и provenance, но не заполняет ими всю ленту.

### `not_interesting`

- сильный штраф конкретной карточке;
- слабый временный штраф теме/формату;
- не закрывает обязательный node.

### `too_hard`

Снижает похожую сложность, но не интерес к теме.

### `too_easy`

Увеличивает exploration следующего уровня.

### `too_school_like`

Снижает school-like templates, а не саму учебную область.

## 12. Repetition policy

- показана, не выбрана: можно повторить через несколько batches;
- explicit dismiss: долгий cooldown;
- выбрана: убрать из candidate feed;
- lesson не закончен: библиотека/resume;
- обязательную область возвращать через новую идею.

## 13. Конфигурация по языку

```ts
interface RecommendationPolicy {
  weights: RecommendationWeights;
  mandatoryCoverageWeight: number;
  thematicBreadthWeight: number;
  nextLevelTrialRate: number;
  maxRecentTopicRepeats: number;
  cardCooldownBatches: number;
}
```

Стартовые направления:

- de/fr: выше mandatory coverage;
- el: баланс progression и culture;
- en: выше breadth и natural-input exploration.
