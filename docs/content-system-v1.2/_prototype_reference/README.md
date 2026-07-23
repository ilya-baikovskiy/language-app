# Prototype reference — v8

## Current reference

- `context_reader_content_feed_prototype_v8.html` — открыть напрямую в браузере.
- `context-reader-site-v8.zip` — deployable static package (`index.html` + Vercel config).

## Что прототип фиксирует

- mobile-first app shell;
- glass bottom navigation: `Выбрать`, `Мои тексты`, `Учить`;
- one global active language;
- flag + language + level selector;
- no local `Текущий язык / Все`;
- Russian titles/descriptions in feed and library;
- target-language title + Russian translation in Reader;
- global topics/countries in settings;
- language-scoped library and saved units;
- simplified cards with two image chips.

## Важно

Прототип создан как product/interaction reference. Не переносить его монолитный HTML/JavaScript в production. Реализовать через существующую React architecture, domain contracts, repository adapters, routes, design tokens и tests.

Placeholder visuals не являются утверждённым AI image style. Финальный image pipeline проектируется отдельно.
