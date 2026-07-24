// Клиентский adapter поверх api/user-state.ts (kind=saved-words) — см. этот
// файл для обоснования, почему это не отдельный serverless-эндпоинт.

import { savedWordSchema, type SavedWord } from '../savedWord';
import type { SavedWordRepository } from '../repositories';

export class BlobSavedWordRepository implements SavedWordRepository {
  async listByUser(userId: string): Promise<SavedWord[]> {
    const res = await fetch(`/api/user-state?kind=saved-words&userId=${encodeURIComponent(userId)}`);
    if (!res.ok) throw new Error(`/api/user-state: ${res.status}`);
    const data = (await res.json()) as unknown[];
    return data.map((item) => savedWordSchema.parse(item));
  }

  async upsert(word: SavedWord): Promise<SavedWord> {
    const res = await fetch('/api/user-state?kind=saved-words', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(word),
    });
    if (!res.ok) throw new Error(`/api/user-state: ${res.status}`);
    return savedWordSchema.parse(await res.json());
  }

  async remove(userId: string, wordId: string): Promise<void> {
    const res = await fetch(
      `/api/user-state?kind=saved-words&userId=${encodeURIComponent(userId)}&id=${encodeURIComponent(wordId)}`,
      { method: 'DELETE' },
    );
    if (!res.ok) throw new Error(`/api/user-state: ${res.status}`);
  }
}
