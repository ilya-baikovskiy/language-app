# Скрытый учебный план

## 1. Назначение

Скрытый план помогает ленте соответствовать уровню, покрывать обязательную базу, не застревать в одной теме и постепенно увеличивать сложность. Пользователь не обязан видеть карту или прогресс.

## 2. Почему CEFR недостаточно

Пользователь может быть A2 в целом, но легко читать поездки и плохо понимать жильё, уверенно узнавать настоящее время и путаться в прошлом, читать диалог быстрее, чем объяснение. Поэтому профиль многомерный.

## 3. LearningNode categories

### Коммуникативные ситуации

Знакомство, рассказ о себе, семья, работа, кафе, покупки, жильё, транспорт, здоровье, просьбы, проблемы, планы, мнение, согласие и несогласие.

### Лексические области

Люди, эмоции, дом, еда, одежда, погода, природа, город, работа, технологии, культура, история, общество, здоровье, движение, время.

### Грамматика

Языко-зависимые nodes: времена, отрицание, вопросы, модальность, сравнение, причины, условия, местоименные связи, порядок слов, согласование, устойчивые конструкции.

### Дискурс

Последовательность событий, описание места, описание человека, диалог, объяснение причины, сравнение, аргумент, мнение, резюме.

### Навык чтения

Распознавание частотных слов, удержание референса, хронология, вывод значения из контекста, абстрактное объяснение, чтение почти оригинального материала.

## 4. Contracts

```ts
export interface LearningNode {
  id: string;
  language: LanguageCode;
  category: 'communicative' | 'lexical' | 'grammar' | 'discourse' | 'reading_skill';
  code: string;
  title: string;
  description: string;
  introducedAt: CEFRLevel;
  expectedComfortAt?: CEFRLevel;
  prerequisites: string[];
  relatedNodeIds: string[];
  mandatoryWeight: number;
  defaultPriority: number;
  examples?: string[];
  active: boolean;
}
```

```ts
export interface UserLearningNodeState {
  userId: string;
  language: LanguageCode;
  nodeId: string;

  exposureCount: number;
  completedLessonCount: number;
  recentExposureCount: number;

  difficultyEvidence: number;
  comfortEvidence: number;
  interestEvidence: number;

  coverageScore: number;
  comfortScore: number;
  confidence: number;

  lastExposedAt?: string;
  lastSuccessfulAt?: string;
  updatedAt: string;
}
```

## 5. Не использовать «пройдено»

Один урок не закрывает узел. Нужны:

- несколько exposures;
- разные форматы;
- некоторое время;
- успешное чтение;
- достаточная confidence.

`coverageScore` показывает ширину и повторяемость, `comfortScore` — лёгкость, `confidence` — количество evidence.

## 6. Учебный паспорт урока

```ts
export interface LessonLearningPassport {
  primaryNodeIds: string[];
  secondaryNodeIds: string[];
  plannedNewNodeIds: string[];
  plannedReinforcementNodeIds: string[];

  expectedDifficulty: number;
  targetKnownLexicalRatio?: number;
  maxSentenceLength?: number;
  maxNewGrammarStructures?: number;

  discourseType: string;
  communicativeGoal?: string;
}
```

MVP:

- 1–3 primary nodes;
- 2–6 secondary nodes;
- A0–A1: максимум одна значимая новая грамматическая конструкция;
- не обещать точные слова без автоматической проверки.

## 7. Базовая карта уровней

### A0

- 6–10 коротких предложений;
- одна сцена;
- настоящее время;
- короткий диалог;
- минимум местоименных ссылок;
- 40–90 слов;
- базовые темы: имя, страна, язык, работа, семья, время, еда, город, кафе, транспорт.

### A1

- 70–130 слов;
- распорядок;
- описания;
- планы;
- простое прошлое;
- базовые причины;
- жильё, покупки, здоровье, погода;
- короткие культурные факты.

### A2

- 100–180 слов;
- связное прошлое;
- последовательность событий;
- сравнения;
- причины и последствия;
- мнение героя;
- культурные и исторические миниатюры.

### B1

- 140–230 слов;
- объяснение с идеей;
- аргументация;
- разные точки зрения;
- условия и предположения;
- интервью;
- адаптированные статьи.

### B2

- 180–300 слов;
- естественная вариативность;
- тематическая лексика;
- устойчивые конструкции;
- сокращённые оригинальные материалы;
- профессиональные и абстрактные темы.

## 8. Как обновлять state

Положительное comfort evidence:

- завершение;
- мало taps/100;
- перевод используется редко;
- нормальный темп;
- успешный next-level trial;
- explicit `too_easy`.

Difficulty evidence:

- много taps;
- повторные taps;
- высокая translation dependency;
- early abandonment;
- explicit `too_hard`.

Interest evidence:

- card opened;
- completion;
- more_like_this;
- return to lesson;
- выбор похожих карточек.

`details_opened` неоднозначен: это может быть любопытство, поэтому его вес небольшой.

## 9. Переход уровня

Уровень меняет пользователь. Приложение может предложить trial, если:

- есть 8–12 завершённых материалов;
- comfort стабильно высокий;
- разные обязательные области имеют coverage;
- перевод не используется постоянно;
- пробные материалы следующего уровня завершались успешно.

Плавный режим:

```text
4 карточки текущего уровня + 1 пробная
затем 3 + 2
затем предложение изменить уровень
```

## 10. Консервативность

- Один пропуск не означает нелюбовь.
- Один лёгкий текст не означает mastery.
- Не понижать уровень молча.
- Обязательная область не исчезает из-за низкого interest score.
- Старое evidence постепенно теряет вес.


## UX-связь: глобальные интересы и раздельное языковое состояние

- `enabledTopicIds` и `enabledCountryOrRegionIds` — глобальные preferences пользователя;
- learning nodes, evidence, difficulty и coverage — раздельные по языкам;
- одна canonical content idea может покрывать разные learning nodes в разных language-specific Lessons;
- UI не показывает learning gaps напрямую;
- отключённая тема не удаляет обязательную базу: она должна появляться внутри разрешённых сюжетов;
- `activeLanguage` выбирает, какой learning map применяется сейчас.
