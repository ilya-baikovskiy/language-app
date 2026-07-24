// Клиентский adapter поверх api/user-state.ts (kind=profiles) — объединено с
// app-preferences в один serverless-файл, см. api/user-state.ts для
// обоснования (Vercel Hobby function-count limit).

import { languageProfileSchema, type LanguageProfile } from '../userTypes';
import type { LanguageProfileRepository } from '../repositories';

export class BlobLanguageProfileRepository implements LanguageProfileRepository {
  async getByUser(userId: string): Promise<LanguageProfile[]> {
    const res = await fetch(`/api/user-state?kind=profiles&userId=${encodeURIComponent(userId)}`);
    if (!res.ok) throw new Error(`/api/user-state: ${res.status}`);
    const data = (await res.json()) as unknown[];
    return data.map((item) => languageProfileSchema.parse(item));
  }

  async get(userId: string, language: string): Promise<LanguageProfile | null> {
    const profiles = await this.getByUser(userId);
    return profiles.find((profile) => profile.language === language) ?? null;
  }

  async upsert(profile: LanguageProfile): Promise<LanguageProfile> {
    const res = await fetch('/api/user-state?kind=profiles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (!res.ok) throw new Error(`/api/user-state: ${res.status}`);
    return languageProfileSchema.parse(await res.json());
  }
}
