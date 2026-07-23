// Feature flags — см. 11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md §Начальные feature flags.
// Обязательный механизм для всего рискованного: "любой adaptive слой должен
// иметь deterministic baseline fallback" (09_TESTING_EVALUATION_AND_GUARDRAILS.md).
// Не читать флаги напрямую из import.meta.env по месту использования — только
// через этот модуль, чтобы дефолты и источник правды были в одном месте.

export type ContentSystemFeatureFlags = {
  contentFeedEnabled: boolean;
  adaptiveRankingEnabled: boolean;
  learningStateUpdatesEnabled: boolean;
  levelTrialsEnabled: boolean;
  sourceBasedCardsEnabled: boolean;
  eventTrackingEnabled: boolean;
};

export const CONTENT_SYSTEM_FEATURE_FLAGS: ContentSystemFeatureFlags = {
  contentFeedEnabled: import.meta.env.DEV,
  adaptiveRankingEnabled: false,
  learningStateUpdatesEnabled: false,
  levelTrialsEnabled: false,
  sourceBasedCardsEnabled: false,
  // Dev-only for now, same call as contentFeedEnabled above — PR 4 does not
  // turn this on in production by itself; enabling it there is a separate
  // decision for the user to make once the debug journey has been reviewed.
  eventTrackingEnabled: import.meta.env.DEV,
};
