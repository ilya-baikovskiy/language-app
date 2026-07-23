# Frontend UX и состояния

> Полная утверждённая модель находится в `16_APPROVED_MOBILE_UX_AND_NAVIGATION.md`. Этот документ описывает implementation surface и состояния.

## 1. Основные поверхности

1. `ChoosePage` / `FeedPage` — выбрать новый материал.
2. `LibraryPage` — материалы активного языка.
3. `LearnPage` — сохранённые слова/фразы активного языка и будущая очередь повторения.
4. `ReaderPage` — существующий reader, не нижняя вкладка.
5. `GenerateLessonPage` — ручная генерация/вставка текста остаётся вторичным сценарием.
6. `LanguageAndTopicSettings` — уровни языков, глобальные темы и страны.
7. `RecommendationDebugPage` — development/admin only.

## 2. App shell

### Верхняя панель

- brand/logo;
- глобальный selector `flag + language + level`;
- settings icon.

Selector виден на всех трёх основных вкладках. В Reader скрыт.

### Нижняя навигация

- `Выбрать`;
- `Мои тексты`;
- `Учить`.

Floating glass style, safe area, минимум 44px touch targets. Подписи видны всегда.

### State

```ts
interface AppShellState {
  activeLanguage: LanguageCode;
  activeTab: 'choose' | 'library' | 'learn';
}
```

Не поддерживать основной UI state `current/all` для library или learn.

## 3. ChoosePage

### Заголовки

- `Что почитаем?`;
- `Подобрано для тебя`;
- secondary CTA `Предложить другие`.

Не показывать subtitle, `Сегодня`, количество идей, catalogue block или объяснение генерации.

### Feed

- пять карточек;
- первая визуально крупная;
- остальные обычные;
- одна колонка на mobile;
- responsive editorial grid на desktop.

### Card contract в UI

```ts
interface PublicFeedCardViewModel {
  cardId: string;
  image: CardImageRef | PlaceholderImage;
  provenanceLabel: string;
  durationLabel: string;
  titleRu: string;
  descriptionRu: string;
  ctaLabel: 'Читать';
}
```

Не добавлять в view model дублирующие `countryLabel`, `languageBadge`, `levelBadge`, `formatBadge`, `heroBadge` для production feed.

## 4. Global language behavior

При выборе нового языка:

- update `activeLanguage`;
- load/calculate feed этого языка и уровня;
- rerender library только этого языка;
- rerender saved units/review queue только этого языка;
- сохранить выбор как app preference;
- не удалять state остальных языков.

Dropdown закрывается после выбора. Требуются `aria-expanded`, `role=listbox`, keyboard navigation при production implementation.

## 5. Generation UX

После `Читать`:

- create idempotent request;
- snapshot current language and selected level;
- lesson сразу появляется в library как `creating`;
- progress основан на реальных server stages;
- экран можно закрыть;
- status восстанавливается после reload, если текущая architecture это поддерживает.

Человекочитаемые стадии:

- готовим текст;
- проверяем уровень;
- разбираем слова и фразы;
- создаём озвучку;
- проверяем синхронизацию;
- сохраняем.

## 6. LibraryPage

### Scope

Только `activeLanguage`. Не показывать переключатель `Все`.

### Continue

Использовать последний открытый незавершённый урок:

```text
ORDER BY lastOpenedAt DESC
```

Не выбирать автоматически самый высокий progress.

### States

```text
creating
ready
started
completed
failed
```

Карточка показывает:

- image;
- русский title;
- level snapshot;
- duration;
- progress;
- status.

Для failed:

- краткая причина;
- Retry;
- Hide/Delete, если это поддержано текущей библиотекой.

## 7. LearnPage

Только единицы `activeLanguage`.

### Верхний блок

- `На сегодня`;
- количество готовых к повторению единиц;
- CTA `Начать`;
- спокойное объяснение.

### Saved units

- target-language word/phrase;
- Russian contextual meaning;
- Russian source title;
- audio control.

До настоящего SRS не имитировать интервалы и mastered state. Feature может быть shell/placeholder.

## 8. ReaderPage

- target-language title;
- Russian title translation;
- lesson level snapshot + duration;
- existing reader text/audio;
- existing Bottom Sheet;
- sentence translation separate;
- bottom navigation hidden;
- back returns to origin tab;
- global language selector hidden;
- lesson progress and `lastOpenedAt` updated.

Reader открывает конкретный `lessonId`. Нельзя искать урок только по title.

## 9. Feedback

Secondary menu:

- больше такого;
- неинтересно;
- слишком сложно;
- слишком просто;
- слишком учебно;
- плохая озвучка;
- фактическая ошибка.

Feedback необязателен и не показывается модальной анкетой после каждого текста.

## 10. Settings

### Language rows

Для каждого языка:

- language label;
- selected level;
- optional target/goal context.

### Global topics

Один набор на все языки.

### Global countries/regions

Один набор на все языки.

Изменение settings обновляет будущую подборку, не удаляя Lessons.

## 11. Loading и cache

### Feed

- последний batch показывается сразу;
- stale-while-revalidate;
- skeleton только на cold start;
- evergreen seed fallback.

### Generation

- real stage progress;
- recoverable failure;
- no duplicate on retry.

### Reader

- первая версия открывает только ready lesson;
- missing Blob — recoverable error.

## 12. Mobile-first и responsive

- дизайн начинается с narrow mobile viewport;
- карточки в одну колонку;
- hero не выше разумного viewport;
- bottom nav не перекрывает контент;
- settings — full-screen/bottom sheet на mobile;
- desktop — ограниченная ширина app shell и editorial grid;
- images keep readable crop and chip area.

## 13. Accessibility

- real buttons/links;
- keyboard focus;
- language menu semantics;
- `aria-live` для generation progress;
- contrast на blur surfaces;
- reduced motion;
- screen reader labels для provenance, duration, audio и navigation;
- важный текст не запечён в image.

## 14. Debug UI

Показывает:

- active language;
- batch id;
- algorithm version;
- slot;
- scores/reason codes;
- matched learning nodes;
- filtered candidates и причины;
- global topics/countries snapshot;
- recent evidence;
- lesson language/level snapshots;
- state before/after completion.
