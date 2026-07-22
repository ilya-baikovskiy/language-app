# Prompt for Claude Code / Codex

Implement the reader word/phrase explanation bottom sheet in the existing project.

Before changing code, read:

1. `BOTTOM_SHEET_HANDOFF.md` in full;
2. `content-example.json`;
3. every image in `screenshots/`;
4. the existing reader, bottom-sheet/modal primitives, design tokens, typography, audio controls, and AI/API layer in this repository.

The handoff defines product logic and interface hierarchy. The repository's existing design system has priority for exact fonts, colors, spacing tokens, icons, and platform primitives. Do not copy the demo reader page wholesale and do not introduce a parallel design system.

## Required implementation

- Make supported words independently selectable in the reader.
- Preserve the exact selected token while allowing an optional related phrase.
- Add a short state containing part of speech, selected form, audio, contextual translation, optional related phrase, context, and `Подробнее` with a downward chevron.
- Highlight the selected token with the existing accent color and moderate weight; highlight the related phrase with a neutral gray background.
- Load/generate detailed content only after `Подробнее` is activated.
- Once expanded, remove the `Подробнее` control and render typed, optional detail sections.
- Support detail section types for explanation text, equations, tables, bilingual example pairs, and grammar notes.
- Keep the footer fixed without covering scrollable content.
- Reuse the project's existing audio icon and playback flow.
- Implement the complete `πήγε` and `στον` examples from the handoff as development fixtures or tests.
- Ensure `στον` and `σταθμό` remain separate selectable targets.
- Keep sentence translation as a separate reader mode; do not move it into this sheet.

## Content rules

- Do not show empty or low-value sections.
- Do not add a `Вместе` section when it repeats context.
- Do not show `Словарная форма` in the top part of the `πήγε` sheet.
- For verb time comparison use the same person, `я`: `πηγαίνω`, `πήγα`, `θα πάω`.
- Do not specially highlight the current `πήγε` row in the conjugation table.
- Every Greek example must have an idiomatic Russian translation.
- Do not map Russian case questions mechanically onto Greek cases.

## Visual rules

- No CAPS headings inside the sheet.
- No gray cards around tables or reference sections.
- Use white/background surface, spacing, and thin separators.
- Keep the main Greek word compact.
- Avoid heavy bold and avoid combining color, bold, and a pill for the same emphasis.
- Use one Greek text style consistently in tables and similar constructions.

## Process and verification

1. Summarize the existing relevant architecture and propose the smallest integration plan.
2. Implement the feature without replacing unrelated reader code.
3. Add or update tests for state transitions, lazy detail loading, exact token selection, and optional sections.
4. Run the project's existing lint, typecheck, tests, and production build.
5. Verify the acceptance criteria in `BOTTOM_SHEET_HANDOFF.md`.
6. Return mobile screenshots for:
   - reader with selectable words;
   - short `πήγε`;
   - expanded `πήγε` with time comparison;
   - past-tense forms and similar constructions;
   - short and expanded `στον`.

If the current architecture conflicts with the proposed data shape, adapt the shape to the project while preserving the visible behavior and content rules. Ask only if a decision would materially change the product behavior described in the handoff.

