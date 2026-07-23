import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const appendBatchMock = vi.fn();

// The repository is instantiated at module scope inside eventClient.ts (same
// pattern as e.g. CardGenerationView.tsx's BlobLessonArtifactRepository) —
// mock the class so appendBatch is controllable per test without a real
// network call.
vi.mock('../../repositories/blobAnalyticsEventRepository', () => {
  class FakeBlobAnalyticsEventRepository {
    appendBatch = appendBatchMock;
  }
  return { BlobAnalyticsEventRepository: FakeBlobAnalyticsEventRepository };
});

const QUEUE_KEY = 'context-reader:v1:analytics-queue';

class MemoryStorage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) ?? null) : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

function stubBrowserGlobals(): void {
  vi.stubGlobal('localStorage', new MemoryStorage() as unknown as Storage);
  vi.stubGlobal('sessionStorage', new MemoryStorage() as unknown as Storage);
  vi.stubGlobal('window', {
    innerWidth: 375,
    innerHeight: 812,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as Window & typeof globalThis);
  vi.stubGlobal('document', {
    hidden: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as Document);
}

function mockFeatureFlag(eventTrackingEnabled: boolean): void {
  vi.doMock('../../featureFlags', () => ({
    CONTENT_SYSTEM_FEATURE_FLAGS: { eventTrackingEnabled },
  }));
}

describe('eventClient', () => {
  beforeEach(() => {
    vi.resetModules();
    appendBatchMock.mockReset();
    stubBrowserGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('is a no-op when eventTrackingEnabled is off', async () => {
    mockFeatureFlag(false);
    const { track, getSessionEventLog, __getQueueForTests } = await import('../eventClient');

    track('settings_opened', {});

    expect(getSessionEventLog()).toHaveLength(0);
    expect(__getQueueForTests()).toHaveLength(0);
  });

  it('builds a well-formed envelope and records it in the session log', async () => {
    mockFeatureFlag(true);
    const { track, getSessionEventLog } = await import('../eventClient');

    track('bottom_navigation_selected', { fromTab: 'choose', toTab: 'library' });

    const [event] = getSessionEventLog();
    expect(event).toBeDefined();
    expect(event.name).toBe('bottom_navigation_selected');
    expect(event.schemaVersion).toBe(1);
    expect(event.userId).toBe('local-user');
    expect(typeof event.id).toBe('string');
    expect(typeof event.anonymousSessionId).toBe('string');
    expect(event.client.platform).toBe('web');
    expect(event.payload).toEqual({ fromTab: 'choose', toTab: 'library' });
  });

  it('reuses the same anonymousSessionId across track() calls in one session', async () => {
    mockFeatureFlag(true);
    const { track, getSessionEventLog } = await import('../eventClient');

    track('settings_opened', {});
    track('settings_opened', {});

    const [first, second] = getSessionEventLog();
    expect(first.anonymousSessionId).toBe(second.anonymousSessionId);
  });

  it('persists the in-memory queue to localStorage on every track() call', async () => {
    mockFeatureFlag(true);
    const { track } = await import('../eventClient');

    track('settings_opened', {});
    const raw = localStorage.getItem(QUEUE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toHaveLength(1);
  });

  it('restores a previously persisted queue from localStorage on the next load', async () => {
    localStorage.setItem(
      QUEUE_KEY,
      JSON.stringify([
        {
          id: 'existing-event',
          schemaVersion: 1,
          userId: 'local-user',
          anonymousSessionId: 'prior-session',
          name: 'settings_opened',
          occurredAt: '2026-01-01T00:00:00.000Z',
          client: { platform: 'web', appVersion: 'dev' },
          payload: {},
        },
      ]),
    );

    mockFeatureFlag(true);
    const { track, __getQueueForTests } = await import('../eventClient');

    track('settings_opened', {});

    expect(__getQueueForTests()).toHaveLength(2);
    expect(__getQueueForTests()[0].id).toBe('existing-event');
  });

  it('flush sends the queued batch and removes it from the queue on success', async () => {
    mockFeatureFlag(true);
    appendBatchMock.mockResolvedValue({ acceptedCount: 1, duplicateCount: 0 });
    const { track, __flushForTests, __getQueueForTests } = await import('../eventClient');

    track('settings_opened', {});
    await __flushForTests();

    expect(appendBatchMock).toHaveBeenCalledTimes(1);
    expect(__getQueueForTests()).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem(QUEUE_KEY) as string)).toHaveLength(0);
  });

  it('keeps events queued for the next flush attempt when appendBatch fails', async () => {
    mockFeatureFlag(true);
    appendBatchMock.mockRejectedValue(new Error('network down'));
    const { track, __flushForTests, __getQueueForTests } = await import('../eventClient');

    track('settings_opened', {});
    await __flushForTests();

    expect(appendBatchMock).toHaveBeenCalledTimes(1);
    expect(__getQueueForTests()).toHaveLength(1);
  });

  it('flushes automatically on the periodic timer after track() is called', async () => {
    vi.useFakeTimers();
    mockFeatureFlag(true);
    appendBatchMock.mockResolvedValue({ acceptedCount: 1, duplicateCount: 0 });
    const { track, __getQueueForTests } = await import('../eventClient');

    track('settings_opened', {});
    expect(appendBatchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5000);

    expect(appendBatchMock).toHaveBeenCalledTimes(1);
    expect(__getQueueForTests()).toHaveLength(0);
  });
});
