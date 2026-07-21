# Bottom Sheet rework — статус

Реализация плана переработки bottom sheet + режима перевода предложений.
**Этапы A, B, C, D завершены** — билд собирается чисто (`npm run build` + `npm run lint`),
проверено в браузере на sample-уроке.

## Готово

### Этап A — двухуровневое выделение фразы/слова ✅
Клик по слову внутри размеченной фразы: вся фраза тонируется мягко, кликнутое слово —
подчёркивается сильнее. Внутренние токены фразы кликабельны и репортят свой tokenId
(аннотация всё равно фразовая). Файлы: `InteractiveSentence.tsx`, `reader.css`.

### Этап B — двухтировый богатый контент Bottom Sheet ✅
- **`src/types/lesson.ts`** — опциональные поля `Annotation`: `baseForm`, `formInText`,
  `wholePhrase`, `beginnerBreakdown`, `plainLearningNote` (тир 1); `formVariants` (тир 2).
  Типы `FormPair`, `BreakdownPart`, `FormVariant`, `FormVariants`. Все опциональные —
  старые аннотации не ломаются.
- **`lib/pipeline/generateAnnotations.ts`** — генерация в два тира: `generateAnnotationBasic`
  / `generateAnnotationDetails` + общий `callAnnotationModel`.
- **`api/generate-annotation.ts`** — принимает `tier: 'basic' | 'details'`.
- **`src/services/generation/lessonsApi.ts`** — `fetchAnnotationBasic` / `fetchAnnotationDetails`.
- **`src/hooks/useSelectedAnnotation.ts`** — два тира: `loadDetails()`, `retryDetails()`,
  `detailsStatus` в selection; отдельный кэш и статусы для деталей.
- **`src/components/ExplanationSheet.tsx`** — переписан: Уровень 1 (заголовок + реальная
  озвучка, чип единицы, произношение, `shortTranslation`, предложение с подсветкой целевого
  фрагмента `<mark class="sheet-target">`, `contextualMeaning`, пары `baseForm`/`formInText`,
  `beginnerBreakdown` и `wholePhrase` для фраз, `plainLearningNote`); дисклоужер «Подробнее»
  → тир-2 (грамматика, `constructionExplanation`, `formVariants`, примеры, `otherMeanings`) с
  loading/error/retry по `detailsStatus`. Реальная озвучка — только заголовок и предложение;
  у сгенерированных строк кнопка-стаб с тостом «Озвучивание будет добавлено позже».
  `GrammarSummary.tsx`/`GrammarDetails.tsx` удалены (логика внутри шита), `ExampleList.tsx`
  переиспользован.
- **`src/data/sampleLesson.ts`** — тир-1 fixtures у `ann-arrivait`, `ann-a-commence-1`,
  `ann-avoir-besoin`, `ann-sest-assise`, `ann-coeur-leger` (+`formVariants` у `ann-arrivait`),
  чтобы новый UI был виден в `npm run dev` без затрат на AI.

### Этап C — режим перевода предложений ✅
- **`src/types/lesson.ts`** — `Sentence.translation?: string` (fixtures/ленивая дозагрузка).
- **`src/data/sampleLesson.ts`** — `translation` проставлен всем 10 предложениям.
- **`lib/pipeline/translateSentence.ts`** (новый) + **`api/translate-sentence.ts`** (новый,
  `POST {sentenceText, level?} → {translation}`) + `vercel.json` maxDuration 30.
- **`src/services/generation/lessonsApi.ts`** — `fetchSentenceTranslation`.
- **`src/hooks/useSentenceTranslations.ts`** (новый) — session-кэш по `sentence.id`: fixture →
  сразу ready; иначе ленивый фетч (concurrency 3) при включённом режиме; `retry`.
- **`useReaderPreferences` / `types/reader` / `SettingsMenu` / `ReaderHeader`** — тумблер
  «Перевод предложений» (`translationMode`, персист в localStorage).
- **`ArticleContent`** — в режиме перевода предложения рендерятся блоками (`.sentence-block`)
  с русской строкой под каждым (`.sentence-translation`, состояния loading/error+retry); без
  режима — прежний инлайн-рендер. CSS: `.translation-mode`, `.sentence-translation`.

### Этап D — «Сохранить» (стаб на localStorage) ✅
- **`src/hooks/useSavedUnits.ts`** (новый) — localStorage `context-reader:saved`,
  `isSaved` / `toggleSave`.
- **`ExplanationSheet`** — кнопка «Сохранить»/«Сохранено» в футере (только для аннотаций),
  `aria-pressed`; проброшено из `ReaderPage`. Экрана просмотра сохранённого пока нет (v1 стаб).

## Ключевые решения
- Расширяем `Annotation`/`Sentence`, не мигрируем на новые сущности. Новые поля опциональны.
- Ленивый фетч в два тира: клик → тир-1, «Подробнее» → тир-2.
- Fixtures в `sampleLesson` для нового контента — `/api/*` в `npm run dev` (Vite) недоступны.
- Zod не добавляем (json_schema strict гарантирует форму). Тесты — fixtures + браузер.
- «Сохранить» — стаб localStorage, без бэкенда.
