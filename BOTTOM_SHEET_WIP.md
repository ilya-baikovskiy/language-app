# Bottom Sheet rework — статус незавершённой работы (WIP)

Живой статус реализации плана `~/.claude/plans/lazy-wibbling-naur.md` (переработка bottom
sheet + режим перевода предложений). Этот файл и WIP-код лежат в ветке `bottom-sheet-wip`,
НЕ в `master` — потому что код сейчас **не собирается** (см. ниже), а `master` автодеплоится
на Vercel. Влить в `master` только когда Этап B соберётся чисто.

## Что уже сделано

### Этап A — двухуровневое выделение фразы/слова ✅ (в `master`, коммит 2e66f4d)
Клик по слову внутри размеченной фразы: вся фраза тонируется мягко, кликнутое слово —
подчёркивается сильнее. Внутренние токены фразы кликабельны и репортят свой tokenId
(аннотация всё равно фразовая). Файлы: `InteractiveSentence.tsx`, `reader.css`.

### Этап B — двухтировый богатый контент — ЧАСТИЧНО (в ветке `bottom-sheet-wip`)
Сделано:
- **`src/types/lesson.ts`** — добавлены опциональные поля `Annotation`: `baseForm`,
  `formInText`, `wholePhrase`, `beginnerBreakdown`, `plainLearningNote` (тир 1); `formVariants`
  (тир 2). Плюс типы `FormPair`, `BreakdownPart`, `FormVariant`, `FormVariants`. Все
  опциональные — старые аннотации (sampleLesson) не ломаются.
- **`lib/pipeline/generateAnnotations.ts`** — генерация разбита на два тира:
  `BASIC_SCHEMA`+`basicSystemPrompt`→`generateAnnotationBasic`; `DETAILS_SCHEMA`+
  `detailsSystemPrompt`→`generateAnnotationDetails`; общий `callAnnotationModel`.
  `generateAnnotationContent` теперь склеивает оба тира (для CLI/офлайн). Типы
  `AnnotationBasicContent`/`AnnotationDetailsContent`/`AnnotationContent`.
- **`api/generate-annotation.ts`** — принимает `tier: 'basic' | 'details'` (дефолт basic),
  зовёт соответствующую функцию.
- **`src/services/generation/lessonsApi.ts`** — `fetchAnnotationContent` заменён на
  `fetchAnnotationBasic` / `fetchAnnotationDetails`.
- **`src/hooks/useSelectedAnnotation.ts`** — переписан под два тира: `loadDetails()`,
  `retryDetails()`, `detailsStatus` в selection (`idle|loading|ready|error`); отдельный кэш и
  статусы для деталей; `annotationHasDetails()` определяет, есть ли уже тир-2 (sampleLesson →
  сразу ready, без второго запроса).
- **`src/components/ReaderPage.tsx`** — прокидывает `onLoadDetails`/`onRetryDetails` в
  `ExplanationSheet`.

## Что НЕ доделано (Этап B)

1. **`src/components/ExplanationSheet.tsx` — НЕ переписан.** Это причина, по которой билд
   падает: `ReaderPage` уже передаёт `onLoadDetails`/`onRetryDetails`, а шит их не принимает,
   и `SheetSelection.annotation` теперь несёт `detailsStatus`, который шит пока не читает.
   Нужно:
   - Props добавить: `onLoadDetails: () => void`, `onRetryDetails: () => void`.
   - Уровень 1 (всегда виден): заголовок `displayText` + 🔊(реальная озвучка `onSpeak`) +
     `unitLabel`-чип (вывести: `type==='phrase'`→«Фраза»; иначе `baseForm.text!==displayText`
     →«Форма слова»; иначе «Слово») + произношение; `shortTranslation`; блок «В этом
     предложении» — **французское предложение с подсветкой целевого фрагмента** (substring по
     `displayText`, обернуть в `<mark className="sheet-target">`) + 🔊 + `contextualMeaning`;
     пара `baseForm`↔`formInText` (франц. + 🔊-стаб + рус.); `beginnerBreakdown` «Разберём по
     частям» (только фразы); `wholePhrase` «Вся фраза» (только фразы); `plainLearningNote`.
   - Дисклоужер «Подробнее про грамматику и формы» (локальный `expanded`, сброс при смене
     `annotation.id`): по клику `setExpanded(true)` + `onLoadDetails()`. Когда раскрыт —
     рендер по `detailsStatus`: `loading`→спиннер; `error`→сообщение+«Повторить»
     (`onRetryDetails`); `ready`→`grammarLabel`+`grammarSummary`, `grammarDetails`,
     `constructionExplanation`, `formVariants` (список с `isCurrent`), `examples`
     (переиспользовать `ExampleList`), `otherMeanings`.
   - Озвучка **реально vs стаб**: `onSpeak` (реальная дорожка урока) — только для заголовка и
     предложения; для сгенерированных строк (baseForm/formInText/breakdown/wholePhrase/
     formVariants/examples) — кнопка-стаб, показывающая toast «Озвучивание будет добавлено
     позже» (локальный `toast`-стейт + таймаут), т.к. их нет в аудиодорожке.
   - Сохранить существующие ветки `loading`/`error`/`fallback` из `SheetSelection`.
   - Старые аннотации без тир-1 полей должны рендериться gracefully (показывать что есть; для
     них `lemma`-строку выводить, только если нет `baseForm`).
   - `GrammarSummary.tsx`/`GrammarDetails.tsx` — свернуть в новую структуру (можно удалить,
     если больше не используются); `ExampleList.tsx` — переиспользовать.
2. **`src/styles/reader.css`** — стили новых блоков: `.sheet-target` (подсветка фрагмента в
   предложении), `.sheet-sentence`, `.sheet-forms`/`.form-line`, `.breakdown-part`,
   `.whole-phrase`, `.form-variant`(+`.is-current`), `.sheet-more-toggle`, `.sheet-toast`,
   `.sheet-unit-label`, `.sheet-note`.
3. **`src/data/sampleLesson.ts`** — добавить тир-1 поля (baseForm/formInText/wholePhrase/
   beginnerBreakdown/plainLearningNote) к ~5 существующим аннотациям (напр. `ann-arrivait`,
   `ann-avoir-besoin`, `ann-a-commence-1`, `ann-sest-assise`, `ann-coeur-leger`) как fixtures,
   чтобы видеть новый UI без трат на AI. Остальные аннотации остаются как есть.
4. **Проверка Этапа B**: `npm run build` + `npm run lint` чисто; `npm run dev` — клик по
   fixtures-слову показывает уровень 1, «Подробнее» раскрывает детали (в fixtures мгновенно);
   в свежесгенерированном уроке клик → тир-1, «Подробнее» → тир-2 с loading. `sampleLesson`
   не сломан. Затем влить `bottom-sheet-wip` → `master`.

## Ещё не начато

### Этап C — режим перевода предложений
`lib/pipeline/translateSentence.ts` (новый) + `api/translate-sentence.ts` (новый, `POST
{sentenceText, level?}→{translation}`) + `fetchSentenceTranslation` в `lessonsApi.ts` +
`useSentenceTranslations` (новый хук, session-кэш) + тумблер «Перевод» в `SettingsMenu` +
`translationMode` в `useReaderPreferences` + строки перевода под предложениями
(`ArticleContent`/`InteractiveSentence` — обернуть предложение в блок-элемент под
`.translation-mode`) + `vercel.json` maxDuration. Подробности — в плане.

### Этап D — «Сохранить» (стаб на localStorage)
`useSavedUnits()` (новый хук, localStorage `context-reader:saved`) + кнопка «Сохранить» в
футере шита. Экрана просмотра сохранённого пока нет.

## Ключевые решения (чтобы не переспрашивать)
- Расширяем `Annotation`, не мигрируем на `LearningUnit`. Новые поля опциональны.
- Ленивый фетч в два тира: клик → тир-1, «Подробнее» → тир-2.
- Zod не добавляем (json_schema strict уже гарантирует форму). `AudioContent`-тип не заводим.
- Тесты — fixtures + глаза, без vitest.
- «Сохранить» — стаб localStorage, без бэкенда.
