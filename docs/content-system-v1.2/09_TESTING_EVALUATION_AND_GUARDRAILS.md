# Тестирование, evaluation и guardrails

## 1. Что тестировать отдельно

1. data contracts;
2. ranking;
3. slot composition;
4. event ingestion;
5. learning-state update;
6. level fit;
7. naturalness;
8. factual fidelity;
9. generation idempotency;
10. mobile UX;
11. existing TTS and Bottom Sheet regression.

## 2. Unit tests: recommendation

Обязательные кейсы:

- hero выбирается по interest среди eligible;
- карточка вне level range исключается;
- expired news исключается;
- одна карточка не занимает два слота;
- один topic не заполняет все позиции;
- mandatory gap получает шанс, но не становится hero только из-за gap;
- recent hero получает penalty;
- `not_interesting` не удаляет learning node навсегда;
- `too_hard` влияет на difficulty, а не на topic interest;
- refresh создаёт новый batch.

## 3. Unit tests: tracking/state

- event UUID обеспечивает dedup;
- progress milestone записывается один раз;
- background time не считается active reading;
- completion обновляет exposure;
- один lesson не даёт coverage=1;
- confidence растёт с evidence;
- старое evidence имеет decay;
- пересчёт из raw events детерминирован.

## 4. Integration tests

```text
seed card
→ feed batch
→ card selection
→ idempotent job
→ blueprint
→ existing lesson generation
→ Blob + metadata
→ reader
→ events
→ state update
→ changed next feed
```

Также:

- reload during generation;
- retry after provider failure;
- missing Blob;
- change language level;
- import user text;
- source-based attribution.

## 5. AI contract tests

Каждый AI output:

- проходит JSON Schema/Zod;
- использует разрешённый язык;
- использует существующие node codes;
- word count within hard range;
- source refs существуют;
- factual claims имеют mapping;
- enums известны;
- no empty teaser/title;
- no duplicated card title.

## 6. Content eval sets

Создать curated набор минимум по 10 текстов на язык/уровень.

### German/French A0–A1

- знакомство;
- кафе;
- квартира;
- транспорт;
- магазин;
- простое культурное наблюдение;
- scene + dialogue.

### Greek A2–B1

- остров;
- исторический эпизод;
- работа;
- путешествие;
- причина/следствие;
- мнение;
- past/future contrast.

### English B1–B2

- AI;
- design;
- linguistics;
- society;
- science;
- professional vocabulary;
- idiomatic construction density.

Человеческая оценка:

- интересно ли;
- естественно ли;
- соответствует ли уровню;
- слишком ли учебно;
- хочется ли дочитать;
- корректны ли факты;
- качественна ли озвучка.

## 7. CEFR guardrails

CEFR label из prompt не считается проверкой.

Автоматически анализировать:

- sentence length distribution;
- lexical frequency bands;
- subordinate clauses;
- named entity density;
- abstract nouns;
- morphology diversity;
- tense/mood usage;
- pronoun reference complexity;
- dialogue ratio;
- type-token ratio.

Использовать как guardrail, не как официальную сертификацию.

## 8. Factual guardrails

- factual provenance требует sources;
- current event хранит event date и publish date;
- expired card не показывается;
- легенда маркируется как легенда;
- disputed claim не становится фактом;
- no invented quote;
- no fake source URL;
- `factual_issue` создаёт review flag.

## 9. Offline recommendation simulations

### User A

Greek A2, любит culture, почти не читал housing.

Ожидание:

- hero culture;
- отдельная привлекательная housing card;
- diversity;
- один stretch B1.

### User B

German A1, high taps, translation always on.

Ожидание:

- короткие concrete scenes;
- no A2 trial;
- low abstraction;
- mandatory basics.

### User C

English B2, любит AI/design, избегает длинных новостей.

Ожидание:

- hero AI/design;
- thematic breadth;
- source-based short explainers;
- не пять AI-карточек подряд.

## 10. Product guardrails

Запрещено алгоритму:

- оптимизировать taps как успех;
- намеренно усложнять ради engagement;
- блокировать карточки за “непройденный урок”;
- автоматически менять уровень;
- делать национальные стереотипы абсолютными;
- показывать stale news как fresh;
- считать один skip отсутствием интереса;
- считать details только сигналом трудности.

## 11. Feature flags

```text
contentFeedEnabled
adaptiveRankingEnabled
learningStateUpdatesEnabled
levelTrialsEnabled
sourceBasedCardsEnabled
topicCatalogueEnabled
eventTrackingEnabled
```

Любой adaptive слой должен иметь deterministic baseline fallback.

## 12. Launch gate для адаптации

Не включать adaptive ranking, пока:

- события не валидированы;
- debug page не готов;
- есть реальная история чтений;
- state updates проверены вручную;
- ranking можно отключить;
- fixed feed работает;
- нет потери или дублей events.

## 13. Regression checklist

- existing reader opens old lessons;
- Bottom Sheet sequence unchanged;
- phrase groups still work;
- sentence translation remains separate;
- TTS quality gate preserved;
- word clips preserved;
- language configs not hardcoded in new feed.


## Mobile UX v8 regression matrix

### Global language

- changing language updates choose/library/learn;
- no local `current/all` controls exist;
- state for other languages is preserved;
- Reader keeps lesson language and level snapshot;
- external lesson does not silently mutate active language.

### Feed cards

- Russian title and description;
- exactly two overlay chips: provenance + duration;
- no country/minutes duplication;
- no `Главная`, language, level or format badge;
- hero visual hierarchy remains clear;
- `В тексте` has same typography/color as description.

### Library/Learn

- only active-language records visible;
- Continue uses lastOpenedAt;
- same canonical card can have distinct lesson ids per language;
- saved units are language-scoped.

### Navigation

- glass bottom nav has three tabs;
- Reader hides bottom nav;
- back returns to origin tab;
- safe area and bottom padding prevent overlap;
- language dropdown and nav are keyboard/screen-reader usable.
