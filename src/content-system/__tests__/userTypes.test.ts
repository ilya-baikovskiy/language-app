import { describe, expect, it } from 'vitest';
import {
  appPreferencesSchema,
  createDefaultAppPreferences,
} from '../userTypes';

describe('AppPreferences training phrase mode', () => {
  it('старые настройки без trainingPhraseMode мигрируют в source', () => {
    const now = new Date().toISOString();
    const parsed = appPreferencesSchema.parse({
      userId: 'local-user',
      activeLanguage: 'el',
      enabledTopicIds: [],
      enabledCountryOrRegionIds: [],
      createdAt: now,
      updatedAt: now,
      revision: 1,
    });

    expect(parsed.trainingPhraseMode).toBe('source');
  });

  it('новые настройки по умолчанию используют source', () => {
    expect(createDefaultAppPreferences('local-user', 'el').trainingPhraseMode).toBe('source');
  });
});
