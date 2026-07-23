// AnalyticsEventRepository adapter — POSTs a whole batch to
// api/events-batch.ts, which writes one new immutable JSON file per batch
// (never a read-modify-write index, unlike lessons/app-preferences — see
// docs/content-system-v1.2/06_DATA_MODEL_AND_STORAGE.md §3.5).

import type { AnalyticsEventRepository } from '../repositories';
import type { AnalyticsEvent } from '../analyticsEvent';

export class BlobAnalyticsEventRepository implements AnalyticsEventRepository {
  async appendBatch(events: AnalyticsEvent[]): Promise<{ acceptedCount: number; duplicateCount: number }> {
    const res = await fetch('/api/events-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    });
    if (!res.ok) throw new Error(`/api/events-batch: ${res.status}`);
    return (await res.json()) as { acceptedCount: number; duplicateCount: number };
  }
}
