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

describe('AppPreferences newWordsPerSession', () => {
  it('старые настройки без поля получают прежний лимит 10 — поведение не меняется', () => {
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

    expect(parsed.newWordsPerSession).toBe(10);
  });

  it('принимает только предусмотренные варианты темпа', () => {
    const now = new Date().toISOString();
    const base = {
      userId: 'local-user',
      activeLanguage: 'el',
      enabledTopicIds: [],
      enabledCountryOrRegionIds: [],
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    for (const value of [5, 10, 20]) {
      expect(appPreferencesSchema.parse({ ...base, newWordsPerSession: value }).newWordsPerSession).toBe(value);
    }
    expect(() => appPreferencesSchema.parse({ ...base, newWordsPerSession: 7 })).toThrow();
  });

  it('новые настройки по умолчанию берут 10 новых слов за сессию', () => {
    expect(createDefaultAppPreferences('local-user', 'el').newWordsPerSession).toBe(10);
  });
});
