// AnalyticsEvent envelope — см. docs/content-system-v1.2/05 §4.
//
// PR 4 (tracking experiment): `EventName`/`AnalyticsEventPayloadMap` below are
// only the ~22 events actually instrumented in this PR (see brief §PR 4 /
// 05_TRACKING_EVENTS_AND_METRICS.md) — not the full event catalogue from `05`
// (e.g. `feedback`/`card_dismissed`/`lesson_abandoned` are explicitly out of
// scope, see eventClient.ts and the PR 4 report for why).

export type AnalyticsEvent<TPayload = unknown> = {
  id: string;
  schemaVersion: number;
  userId: string;
  anonymousSessionId: string;
  language?: string;
  lessonId?: string;
  cardId?: string;
  feedBatchId?: string;
  name: string;
  occurredAt: string;
  receivedAt?: string;
  client: {
    platform: 'web';
    appVersion: string;
    viewport?: string;
    locale?: string;
  };
  payload: TPayload;
};

export type FeedSourceKind = 'app_open' | 'language_switch' | 'refresh' | 'settings_change';
export type LessonEntryPoint = 'generated_card' | 'library' | 'resume' | 'deep_link';
export type LessonCompletionMethod = 'reached_end' | 'explicit_button';
// Matches GenerationProgress['stage'] in generateLessonPipeline.ts — kept as
// its own small union here so analyticsEvent.ts doesn't have to import the
// generation pipeline module just for a literal type.
export type GenerationStage = 'starting' | 'text' | 'audio' | 'align' | 'saving';
export type NavTab = 'choose' | 'library' | 'learn';
export type ProgressMilestone = 10 | 25 | 50 | 75 | 90 | 100;

export interface AnalyticsEventPayloadMap {
  // --- App shell / navigation (05 §5) ---------------------------------
  global_language_changed: {
    fromLanguage: string;
    toLanguage: string;
    fromLevel: string;
    toLevel: string;
    currentTab: NavTab;
  };
  bottom_navigation_selected: { fromTab: NavTab; toTab: NavTab };
  settings_opened: Record<string, never>;
  topic_preferences_changed: { added: string[]; removed: string[] };
  country_preferences_changed: { added: string[]; removed: string[] };

  // --- Feed (05 §6) ------------------------------------------------------
  feed_viewed: { itemCount: number; selectedLevel: string; source: FeedSourceKind };
  card_impression: { position: number; slot: string; isHero: boolean };
  card_opened: { position: number; slot: string; timeSinceFeedViewMs: number };
  feed_refreshed: { previousBatchId: string };

  // --- Generation (05 §7) -------------------------------------------------
  lesson_generation_requested: { cardId: string; blueprintId: string; language: string; level: string };
  lesson_generation_stage_started: { lessonId: string; stage: GenerationStage };
  lesson_generation_stage_completed: { lessonId: string; stage: GenerationStage };
  lesson_generation_failed: { lessonId: string; errorMessage: string };
  lesson_generation_completed: { lessonId: string; durationMs: number };

  // --- Reader (05 §8) ------------------------------------------------------
  lesson_opened: { entryPoint: LessonEntryPoint; appActiveLanguage: string; lessonLanguage: string };
  lesson_started: Record<string, never>;
  lesson_progress: { milestone: ProgressMilestone };
  lesson_completed: { completionMethod: LessonCompletionMethod; activeReadingSeconds: number; elapsedSeconds: number };

  // --- Learning interactions (05 §9) ---------------------------------------
  // annotationType is always 'word' in the current per-token model (Bottom
  // Sheet v2 — see PROGRESS.md) — no compound-phrase click path exists.
  token_tapped: { tokenId: string; sentenceId: string; annotationType: 'word' };
  annotation_details_opened: { tokenId: string; timeSinceSheetOpenMs: number };
  learning_unit_saved: { tokenId: string; unitType: 'word' | 'phrase' };
  sentence_translation_toggled: { enabled: boolean; scope: 'lesson'; currentProgress: number };
  audio_started: Record<string, never>;
  audio_paused: Record<string, never>;
  audio_completed: Record<string, never>;
  audio_speed_changed: { fromRate: number; toRate: number };
}

export type EventName = keyof AnalyticsEventPayloadMap;
