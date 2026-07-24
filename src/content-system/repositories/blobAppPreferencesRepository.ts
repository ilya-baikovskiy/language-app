// Клиентский adapter поверх api/user-state.ts (kind=preferences) — объединено
// с language-profiles в один serverless-файл, см. api/user-state.ts для
// обоснования (Vercel Hobby function-count limit). См. репозиторный принцип
// в repositories.ts: UI импортирует только AppPreferencesRepository, не
// fetch/Blob напрямую.

import { appPreferencesSchema, type AppPreferences } from '../userTypes';
import type { AppPreferencesRepository } from '../repositories';

export class BlobAppPreferencesRepository implements AppPreferencesRepository {
  async get(userId: string): Promise<AppPreferences | null> {
    const res = await fetch(`/api/user-state?kind=preferences&userId=${encodeURIComponent(userId)}`);
    if (!res.ok) throw new Error(`/api/user-state: ${res.status}`);
    const data = await res.json();
    if (data === null) return null;
    return appPreferencesSchema.parse(data);
  }

  async upsert(preferences: AppPreferences): Promise<AppPreferences> {
    const res = await fetch('/api/user-state?kind=preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preferences),
    });
    if (!res.ok) throw new Error(`/api/user-state: ${res.status}`);
    return appPreferencesSchema.parse(await res.json());
  }
}
