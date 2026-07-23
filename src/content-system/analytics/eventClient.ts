// Client-side analytics event queue — see
// docs/content-system-v1.2/05_TRACKING_EVENTS_AND_METRICS.md §14 (event
// delivery) and §3.5 in 06_DATA_MODEL_AND_STORAGE.md (immutable batches).
//
// `track()` is the only thing call sites need to know about: it is a no-op
// whenever `eventTrackingEnabled` is off, so every instrumentation call in
// components/hooks can call it unconditionally without checking the flag
// itself. Events are queued in memory, persisted to localStorage so a page
// reload between flushes doesn't lose them, and flushed periodically (plus on
// tab hide/unload) through `AnalyticsEventRepository.appendBatch`.
//
// This module owns a concrete `BlobAnalyticsEventRepository` directly rather
// than accepting one via props/DI — same pattern already used elsewhere in
// this codebase for Blob-backed adapters (e.g. `CardGenerationView.tsx`
// instantiating `BlobLessonArtifactRepository` at module scope).

import { CONTENT_SYSTEM_FEATURE_FLAGS } from '../featureFlags';
import { LOCAL_USER_ID } from '../userTypes';
import { BlobAnalyticsEventRepository } from '../repositories/blobAnalyticsEventRepository';
import type { AnalyticsEventRepository } from '../repositories';
import type { AnalyticsEvent, AnalyticsEventPayloadMap, EventName } from '../analyticsEvent';

const QUEUE_STORAGE_KEY = 'context-reader:v1:analytics-queue';
const SESSION_ID_STORAGE_KEY = 'context-reader:v1:analytics-session-id';
const FLUSH_INTERVAL_MS = 5000;
// How many recent events the in-session debug log keeps — independent of
// whether they were ever successfully flushed (see getSessionEventLog below).
const SESSION_LOG_LIMIT = 200;
// "appVersion из package.json или просто 'dev'" (brief §1) — kept as a plain
// literal instead of importing package.json to avoid pulling a repo-root file
// into the src/ TS project just for a version string that isn't load-bearing.
const APP_VERSION = 'dev';

export type TrackContext = {
  language?: string;
  lessonId?: string;
  cardId?: string;
  feedBatchId?: string;
};

const repository: AnalyticsEventRepository = new BlobAnalyticsEventRepository();

let queue: AnalyticsEvent[] = [];
let sessionLog: AnalyticsEvent[] = [];
let cachedSessionId: string | null = null;
let initialized = false;
let flushTimer: ReturnType<typeof setInterval> | null = null;

function safeStorage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    const storage = kind === 'localStorage' ? localStorage : sessionStorage;
    return storage ?? null;
  } catch {
    // Storage can throw (private mode, disabled cookies, non-browser test
    // environment without the global at all) — treat as unavailable.
    return null;
  }
}

function getAnonymousSessionId(): string {
  if (cachedSessionId) return cachedSessionId;

  const storage = safeStorage('sessionStorage');
  if (storage) {
    const existing = storage.getItem(SESSION_ID_STORAGE_KEY);
    if (existing) {
      cachedSessionId = existing;
      return existing;
    }
    const created = crypto.randomUUID();
    storage.setItem(SESSION_ID_STORAGE_KEY, created);
    cachedSessionId = created;
    return created;
  }

  // No sessionStorage available (SSR / non-browser test env) — fall back to
  // a per-process id so the envelope is still well-formed.
  cachedSessionId = crypto.randomUUID();
  return cachedSessionId;
}

function loadPersistedQueue(): AnalyticsEvent[] {
  const storage = safeStorage('localStorage');
  if (!storage) return [];
  try {
    const raw = storage.getItem(QUEUE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AnalyticsEvent[]) : [];
  } catch {
    return [];
  }
}

function persistQueue(): void {
  const storage = safeStorage('localStorage');
  if (!storage) return;
  try {
    storage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Quota/unavailable — queue still lives in memory for this tab, just
    // won't survive a reload. Not worth failing track() over.
  }
}

async function flush(): Promise<void> {
  if (queue.length === 0) return;
  // Snapshot rather than referencing `queue` directly — track() may push more
  // events while this await is in flight, and we must not drop those.
  const batch = [...queue];
  try {
    await repository.appendBatch(batch);
    const sentIds = new Set(batch.map((event) => event.id));
    queue = queue.filter((event) => !sentIds.has(event.id));
    persistQueue();
  } catch {
    // Leave everything in the queue for the next tick — no fast retry loop,
    // the flush interval itself is the backoff (see brief §1 "не ретраить
    // бесконечно быстро").
  }
}

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;
  queue = loadPersistedQueue();

  if (typeof window === 'undefined') return;

  flushTimer = setInterval(() => {
    void flush();
  }, FLUSH_INTERVAL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void flush();
  });
  window.addEventListener('pagehide', () => {
    void flush();
  });
}

export function track<TName extends EventName>(
  name: TName,
  payload: AnalyticsEventPayloadMap[TName],
  context?: TrackContext,
): void {
  if (!CONTENT_SYSTEM_FEATURE_FLAGS.eventTrackingEnabled) return;
  ensureInitialized();

  const event: AnalyticsEvent<AnalyticsEventPayloadMap[TName]> = {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    userId: LOCAL_USER_ID,
    anonymousSessionId: getAnonymousSessionId(),
    language: context?.language,
    lessonId: context?.lessonId,
    cardId: context?.cardId,
    feedBatchId: context?.feedBatchId,
    name,
    occurredAt: new Date().toISOString(),
    client: {
      platform: 'web',
      appVersion: APP_VERSION,
      viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : undefined,
      locale: typeof navigator !== 'undefined' ? navigator.language : undefined,
    },
    payload,
  };

  const asEnvelope = event as AnalyticsEvent;
  queue.push(asEnvelope);
  persistQueue();

  sessionLog.push(asEnvelope);
  if (sessionLog.length > SESSION_LOG_LIMIT) sessionLog = sessionLog.slice(-SESSION_LOG_LIMIT);
}

// Debug screen (SettingsOverlay's dev-only "Debug: события") reads this —
// see brief §4. Independent of whether events were ever successfully sent.
export function getSessionEventLog(): AnalyticsEvent[] {
  return sessionLog;
}

// --- Test-only helpers -------------------------------------------------
// Exported (not hidden behind NODE_ENV) so the unit test file can import them
// directly instead of relying on vi.resetModules() per test. Prefixed so
// production call sites don't reach for them by accident.

export function __resetAnalyticsClientForTests(): void {
  queue = [];
  sessionLog = [];
  cachedSessionId = null;
  initialized = false;
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = null;
}

export function __flushForTests(): Promise<void> {
  return flush();
}

export function __getQueueForTests(): AnalyticsEvent[] {
  return queue;
}
