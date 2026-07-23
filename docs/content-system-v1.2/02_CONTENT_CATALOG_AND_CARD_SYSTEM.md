# Каталог контента и система карточек

> UI-представление карточек и mobile navigation определены в `16_APPROVED_MOBILE_UX_AND_NAVIGATION.md`.

## 1. Почему идея отделена от урока

Полный `Lesson` дорогой: текст, токенизация, phrase groups, аннотации, перевод, TTS, тайминги, recovery, quality gate и Blob persistence. Поэтому лента не должна заранее генерировать полные уроки, которые пользователь может не открыть.

Нужно разделить четыре сущности.

### `ContentIdea` / canonical card

Языково-независимая идея материала: предмет, русская editorial-копия, темы, страны/регионы, формат, provenance и источники.

### `FeedItem`

Проекция canonical idea в конкретную подборку активного языка и уровня.

### `LessonBlueprint`

Language-specific план будущего урока, создаваемый после выбора.

### `Lesson`

Полный материал reader, создаваемый после выбора.

Главное следствие: тема `Почему в Швейцарии несколько языков` может стать Greek A2, German A1, French A1 или English B2 Lesson без создания четырёх несвязанных идей.

## 2. Каталог направлений

Каталог нужен алгоритму и настройкам, но не показывается отдельным блоком на главной ленте.

### Повседневная жизнь и спокойные мини-истории

Утро в кафе, прогулка, поезд, вечер у моря, семейная традиция, внутреннее наблюдение героя.

### Практические ситуации

Знакомство, работа, кафе, магазин, жильё, транспорт, врач, просьба, проблема, планы.

### Культура и повседневность

Привычки, правила общения, общественные места, праздники, семейная и рабочая культура.

### История

Один человек, предмет, короткое событие, происхождение традиции или легенда.

### Места, природа и архитектура

Города, острова, горы, озёра, деревни, здания, маршруты, традиционные дома.

### Люди и менталитет

Как общаются, работают, отдыхают и принимают решения. Избегать абсолютных национальных стереотипов.

### Язык и выражения

Происхождение слов, варианты, ложные друзья, устойчивые фразы, особенности произношения.

### Еда

Блюда, рынки, семейные рецепты, история еды, локальные привычки.

### Путешествия

Поезд, автобус, паром, маршрут, разговор с местным, потерянная вещь, неожиданная остановка.

### AI и технологии

Новые продукты, исследования, интерфейсы, автоматизация, влияние технологий.

### Общество и политика

Решения, институты, изменения, внешняя политика. Обычно B1+, для A2 — сильная адаптация.

### Свежие события

Одна короткая проверенная новость. Новости не должны вытеснять вечнозелёный контент.

## 3. Страны и регионы

География независима от языка чтения. Стартовый набор:

- Greece;
- Greek islands;
- Cyprus history/culture;
- Germany;
- Bavaria;
- Austria;
- Switzerland;
- France;
- Belgium;
- Luxembourg;
- francophone regions;
- world/other.

Настройки тем и стран глобальны для пользователя. Learning state остаётся раздельным по языкам.

## 4. Форматы

```ts
export type ContentFormat =
  | 'calm_story'
  | 'story_with_dialogue'
  | 'practical_dialogue'
  | 'cultural_miniature'
  | 'fact_explainer'
  | 'historical_episode'
  | 'place_portrait'
  | 'adapted_article'
  | 'current_event'
  | 'language_note'
  | 'serialized_story_episode'
  | 'user_text_adaptation';
```

Тема и формат — разные измерения. «Здоровье» может появиться как диалог в аптеке, простуда в поездке или культурный материал про аптеки.

## 5. Canonical `ContentCard` contract

Название `ContentCard` можно сохранить ради совместимости, но domain-смысл — canonical cross-language idea.

```ts
export interface ContentCard {
  id: string;
  schemaVersion: number;
  canonicalSubjectKey: string;

  editorialTitleRu: string;
  editorialDescriptionRu: string;
  learningFocusLabelRu?: string;

  topicIds: string[];
  format: ContentFormat;
  countryOrRegionIds: string[];

  estimatedReadingSeconds: number;
  provenanceType:
    | 'ai_fiction'
    | 'source_based_explainer'
    | 'adapted_article'
    | 'current_event'
    | 'user_text';

  supportedLanguages?: LanguageCode[];
  levelSuitability?: Partial<Record<LanguageCode, {
    min: CEFRLevel;
    max: CEFRLevel;
  }>>;

  learningNodeIds: string[];
  sourceRefs?: SourceReference[];
  freshness?: {
    sourcePublishedAt?: string;
    cardPreparedAt: string;
    expiresAt?: string;
  };

  generationStatus: 'idea_only' | 'blueprint_ready';
  featuredEligibility: boolean;

  quality: {
    factualConfidence?: number;
    editorialScore?: number;
    predictedInterestScore?: number;
  };

  status: 'active' | 'archived' | 'expired';
  createdAt: string;
  updatedAt: string;
}
```

Карточка не обязана хранить заголовок урока на всех языках. Target-language title и сам текст создаются/валидируются в `LessonBlueprint`/Lesson pipeline.

## 6. `FeedItem` contract

```ts
export interface FeedItem {
  cardId: string;
  language: LanguageCode;
  targetLevel: CEFRLevel;
  position: number;
  slot: FeedSlot;
  reasonCodes: RecommendationReasonCode[];
}
```

Feed response объединяет `FeedItem` и public projection карточки.

## 7. Что показывать на карточке

### Показывать

- AI-generated image или placeholder;
- provenance chip;
- duration chip;
- русский editorial title;
- русское описание;
- `В тексте: ...` как часть того же описания;
- CTA `Читать`.

### Не показывать

- язык/уровень на каждой карточке;
- страну и минуты рядом с заголовком;
- category badge над заголовком;
- отдельный learning-focus block;
- `Главная`;
- score/slot/node ids/mastery;
- target-language title в feed.

Язык и уровень считываются из одного глобального selector в шапке.

## 8. Большая карточка

Hero — самая интересная среди eligible-кандидатов.

Порядок:

1. отфильтровать неподходящее по языку/уровню;
2. применить global topic/country preferences;
3. убрать слабое, просроченное и недостоверное;
4. применить repetition penalties;
5. выбрать максимальный interest fit;
6. при близких scores предпочесть разнообразие.

Hero отличается размером и композицией, но не получает отдельный badge `Главная`.

## 9. Cross-language adaptation

Выбор карточки фиксирует:

- canonical `cardId`;
- `activeLanguage`;
- selected level snapshot;
- language goal;
- learning gaps;
- source facts;
- style/length constraints.

Из этого создаётся отдельный `LessonBlueprint`.

Не делать literal translation одной master-версии. Каждая версия должна звучать естественно для языка и соответствовать уровню.

## 10. Подготовка карточек заранее

Раз в день или по ручной команде:

1. определить потребности будущих слотов по всем языкам;
2. подобрать 12–30 canonical ideas;
3. подготовить русскую editorial-копию;
4. привязать темы, страны и learning nodes;
5. проверить schema и источники;
6. дедуплицировать;
7. сохранить candidate pool.

Не генерировать заранее:

- полный текст;
- target-language annotations;
- TTS;
- тайминги;
- полный перевод.

Можно подготовить заранее:

- source summary;
- factual claim map;
- language adaptation hints;
- learning passport template;
- ограничения длины/уровня.

## 11. Source registry

```ts
export interface SourceRegistryEntry {
  id: string;
  name: string;
  baseUrl: string;
  sourceLanguages: LanguageCode[];
  allowedTopics: string[];
  trustTier: 'primary' | 'trusted_editorial' | 'discovery_only';
  canAdapt: boolean;
  requiresAttribution: boolean;
  notes?: string;
  enabled: boolean;
}
```

Язык источника не ограничивает язык будущего Lesson. `discovery_only` может дать идею, но факты подтверждаются надёжным источником.

## 12. Дедупликация

Проверять:

- `canonicalSubjectKey`;
- normalized Russian editorial title;
- source URLs;
- topic + country/region;
- недавние показы;
- semantic similarity, когда появится embedding layer.

Одна canonical idea может существовать в нескольких Lessons. Дедупликация Lesson выполняется по `lessonId`/request key, а не по title.

## 13. Сериализованные истории

- 3–5 коротких эпизодов;
- каждый читается отдельно;
- `seriesId` и `episodeNumber`;
- продолжение учитывает прочитанные эпизоды;
- сериал не занимает всю ленту;
- canonical series также может иметь language-specific adaptations.
