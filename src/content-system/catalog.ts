// Каталог глобальных тем и стран/регионов — см.
// docs/content-system-v1.2/02_CONTENT_CATALOG_AND_CARD_SYSTEM.md §2-3 и
// 16_APPROVED_MOBILE_UX_AND_NAVIGATION.md §8.
//
// Темы и страны — независимые измерения от языка чтения (16 §8): один и тот
// же список используется для всех activeLanguage. Список показывается только
// в настройках (SettingsOverlay), не в основной ленте (16 §5 — «убрать
// каталог `Что вообще может генерироваться` с главного экрана»).
//
// ids ниже совпадают с topicIds/countryOrRegionIds, уже используемыми в
// seeds/content-ideas.v1.json (everyday_life, practical_situations,
// culture_and_everyday, history, places_nature_architecture,
// language_and_expressions, food, travel, greece, greek_islands, germany,
// bavaria, austria, switzerland, france, world_other) плюс остальные
// направления из документа 02 §2-3, для которых пока нет seed-карточек, но
// настройки должны быть содержательными сразу (не только под текущие 8 карточек).

export type CatalogEntry = { id: string; labelRu: string };

export const TOPICS: CatalogEntry[] = [
  { id: 'everyday_life', labelRu: 'Повседневная жизнь и спокойные мини-истории' },
  { id: 'practical_situations', labelRu: 'Практические ситуации' },
  { id: 'culture_and_everyday', labelRu: 'Культура и повседневность' },
  { id: 'history', labelRu: 'История' },
  { id: 'places_nature_architecture', labelRu: 'Места, природа и архитектура' },
  { id: 'people_and_mentality', labelRu: 'Люди и менталитет' },
  { id: 'language_and_expressions', labelRu: 'Язык и выражения' },
  { id: 'food', labelRu: 'Еда' },
  { id: 'travel', labelRu: 'Путешествия' },
  { id: 'ai_and_technology', labelRu: 'AI и технологии' },
  { id: 'society_and_politics', labelRu: 'Общество и политика' },
  { id: 'current_events', labelRu: 'Свежие события' },
];

export const COUNTRIES: CatalogEntry[] = [
  { id: 'greece', labelRu: 'Греция' },
  { id: 'greek_islands', labelRu: 'Греческие острова' },
  { id: 'cyprus', labelRu: 'Кипр' },
  { id: 'germany', labelRu: 'Германия' },
  { id: 'bavaria', labelRu: 'Бавария' },
  { id: 'austria', labelRu: 'Австрия' },
  { id: 'switzerland', labelRu: 'Швейцария' },
  { id: 'france', labelRu: 'Франция' },
  { id: 'belgium', labelRu: 'Бельгия' },
  { id: 'luxembourg', labelRu: 'Люксембург' },
  { id: 'francophone_regions', labelRu: 'Франкоязычные регионы' },
  { id: 'world_other', labelRu: 'Другие страны и регионы' },
];
