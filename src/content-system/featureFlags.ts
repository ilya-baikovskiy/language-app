// Feature flags — см. 11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md §Начальные feature flags.
// Обязательный механизм для всего рискованного: "любой adaptive слой должен
// иметь deterministic baseline fallback" (09_TESTING_EVALUATION_AND_GUARDRAILS.md).
// Не читать флаги напрямую из import.meta.env по месту использования — только
// через этот модуль, чтобы дефолты и источник правды были в одном месте.

export type ContentSystemFeatureFlags = {
  adaptiveRankingEnabled: boolean;
  learningStateUpdatesEnabled: boolean;
  levelTrialsEnabled: boolean;
  sourceBasedCardsEnabled: boolean;
  eventTrackingEnabled: boolean;
};

export const CONTENT_SYSTEM_FEATURE_FLAGS: ContentSystemFeatureFlags = {
  adaptiveRankingEnabled: false,
  learningStateUpdatesEnabled: false,
  levelTrialsEnabled: false,
  sourceBasedCardsEnabled: false,
  // Dev-only by default, same call as contentFeedEnabled above — PR 4 does not
  // turn this on in production by itself. `VITE_EVENT_TRACKING_ENABLED=true` в
  // Vercel env (Production/Preview) включает трекинг без code-правки/редеплоя,
  // когда пользователь решит начать собирать реальные данные (см.
  // docs/adr/ADR-001-durable-storage.md — это решение отделено от Storage ADR).
  eventTrackingEnabled: import.meta.env.VITE_EVENT_TRACKING_ENABLED === 'true' || import.meta.env.DEV,
};
