// AnalyticsEvent envelope — см. docs/content-system-v1.2/05 §4.
//
// Только конверт. Конкретные EventName/payload-объединения (feed_viewed,
// lesson_opened, token_tapped, ...) вводятся в PR 4 (tracking experiment) —
// вводить их раньше означало бы специфицировать инструментацию для экранов,
// которых ещё нет (FeedPage/ReaderPage-инструментация из PR 2/3).

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
