# Source registry и editorial policy

## 1. Цель

Фактические карточки должны быть интересными, проверяемыми и пригодными для адаптации.
Нельзя превращать систему в бесконтрольный web scraper.

## 2. Уровни доверия

### `primary`

- официальные учреждения;
- музеи;
- университеты;
- research papers;
- статистические органы;
- первичные документы.

### `trusted_editorial`

- качественные медиа;
- культурные издания;
- энциклопедические проекты с редакцией;
- проверенные travel/culture publishers.

### `discovery_only`

- блоги;
- social media;
- агрегаторы;
- страницы, дающие идею, но не достаточные для claims.

## 3. Политика по типам

### Культура/места

- минимум один trusted source;
- предпочтительно local/official source;
- избегать туристических мифов без маркировки.

### История

- различать факт, версию, легенду;
- не давать точную дату, если источник её не подтверждает;
- избегать presentism и национальных обобщений.

### Current events/politics

- дата события обязательна;
- источник свежий;
- для существенных claims желательно 2 источника или primary source;
- карточка имеет expiry;
- адаптация объясняет контекст, но не добавляет opinion как факт.

### Science/technology

- primary research или official documentation для technical claims;
- editorial source допустим для summary, но claims должны быть аккуратными;
- не писать “исследование доказало”, если результат предварительный.

## 4. Copyright-safe adaptation

- не копировать статью целиком;
- хранить source refs, а не full copyrighted text без необходимости;
- создавать самостоятельную адаптацию;
- короткие цитаты только при реальной необходимости;
- показывать ссылку на оригинал для фактического материала.

## 5. SourceReference

```ts
interface SourceReference {
  id: string;
  registrySourceId?: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt?: string;
  retrievedAt: string;
  trustTier: 'primary' | 'trusted_editorial' | 'discovery_only';
  language?: string;
}
```

## 6. Card expiry

- current event: часы/дни;
- policy/news: дни/недели;
- travel practical facts: периодическая проверка;
- culture/history: evergreen unless corrected;
- seasonal event: explicit season/year.

## 7. Editorial quality checklist

Перед активацией factual card:

- title не clickbait;
- teaser соответствует материалу;
- claims подтверждены;
- region/language корректны;
- нет stereotypes as facts;
- source accessible;
- level adaptation possible;
- topic adds value beyond generic trivia;
- source and date can be shown.

## 8. Source registry bootstrapping

Сначала не собирать сотни сайтов.

Для каждого языка:

- 3–5 official/cultural sources;
- 2–4 trusted editorial sources;
- 1–2 science/technology sources;
- отдельные current-news sources только при включении fresh slot.

Список источников должен быть отдельным versioned config/DB seed и проходить ручную проверку.

## Editorial UI copy

Source-based canonical card хранит проверяемые facts/source refs независимо от будущего языка Lesson. Feed title/description создаются на русском для выбора темы. Target-language title/text создаются после selection и не должны добавлять новые неподтверждённые факты.
