// AppPreferences / LanguageProfile — см. docs/content-system-v1.2/06 §5.1-5.2.
//
// Проект не имеет auth/user-модели (см. docs/content-system/IMPLEMENTATION_DISCOVERY.md,
// «нет auth/userId нигде») — один основной пользователь продукта. LOCAL_USER_ID
// это временная заглушка вместо реального userId, пока не появится auth;
// repository interfaces уже принимают userId параметром, чтобы не переписывать
// сигнатуры при появлении настоящих пользователей.

import { z } from 'zod';
import { cefrLevelSchema, type CEFRLevel } from './types';

export const LOCAL_USER_ID = 'local-user';

export const appPreferencesSchema = z.object({
  userId: z.string(),
  activeLanguage: z.string(),
  enabledTopicIds: z.array(z.string()),
  enabledCountryOrRegionIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  revision: z.number().int().nonnegative(),
});
export type AppPreferences = z.infer<typeof appPreferencesSchema>;

export const languageProfileGoalTypeSchema = z.enum([
  'simple_reading',
  'progress_to_level',
  'vocabulary_breadth',
  'custom',
]);

export const languageProfileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  language: z.string(),
  selectedLevel: cefrLevelSchema,
  targetLevel: cefrLevelSchema.optional(),
  goalType: languageProfileGoalTypeSchema,
  goalNotes: z.string().optional(),
  preferredReadingSeconds: z.object({ min: z.number(), max: z.number() }).optional(),
  levelTrialsEnabled: z.boolean(),
  recommendationConfig: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
  revision: z.number().int().nonnegative(),
});
export type LanguageProfile = z.infer<typeof languageProfileSchema>;

export function createDefaultAppPreferences(userId: string, activeLanguage: string): AppPreferences {
  const now = new Date().toISOString();
  return {
    userId,
    activeLanguage,
    enabledTopicIds: [],
    enabledCountryOrRegionIds: [],
    createdAt: now,
    updatedAt: now,
    revision: 1,
  };
}

export function createDefaultLanguageProfile(userId: string, language: string, selectedLevel: CEFRLevel): LanguageProfile {
  const now = new Date().toISOString();
  return {
    id: `${userId}:${language}`,
    userId,
    language,
    selectedLevel,
    goalType: 'simple_reading',
    levelTrialsEnabled: false,
    recommendationConfig: {},
    createdAt: now,
    updatedAt: now,
    revision: 1,
  };
}
