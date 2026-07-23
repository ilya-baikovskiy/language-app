// Per-language уровень (LanguageProfile.selectedLevel) — см.
// docs/content-system-v1.2/16_APPROVED_MOBILE_UX_AND_NAVIGATION.md §4/§12.
//
// Заполняет профиль для всех 4 языков пайплайна (fr/de/en/el —
// lib/pipeline/languageConfig.ts) дефолтными уровнями прототипа (§4:
// «Greek A2, German A1, French A1, English B2»), если профиль ещё не создан
// на сервере/локально. Тот же паттерн graceful degradation, что и в
// useAppPreferences: сетевая ошибка не роняет экран, просто использует
// дефолт в памяти этой сессии.

import { useCallback, useEffect, useState } from 'react';
import {
  LOCAL_USER_ID,
  createDefaultLanguageProfile,
  type LanguageProfile,
} from '../content-system/userTypes';
import { BlobLanguageProfileRepository } from '../content-system/repositories/blobLanguageProfileRepository';
import type { LanguageProfileRepository } from '../content-system/repositories';
import type { CEFRLevel } from '../content-system/types';
import { listLanguageConfigs, type LanguageCode } from '../../lib/pipeline/languageConfig';

// §4 прототипа — исходные уровни, зафиксированные как дефолт для нового профиля.
const DEFAULT_LEVEL_BY_LANGUAGE: Record<LanguageCode, CEFRLevel> = {
  el: 'A2',
  de: 'A1',
  fr: 'A1',
  en: 'B2',
};

function withDefaults(existing: LanguageProfile[]): LanguageProfile[] {
  const byLanguage = new Map(existing.map((profile) => [profile.language, profile]));
  return listLanguageConfigs().map((config) => {
    const found = byLanguage.get(config.code);
    if (found) return found;
    return createDefaultLanguageProfile(LOCAL_USER_ID, config.code, DEFAULT_LEVEL_BY_LANGUAGE[config.code]);
  });
}

export function useLanguageProfiles(repository: LanguageProfileRepository = new BlobLanguageProfileRepository()) {
  const [profiles, setProfiles] = useState<LanguageProfile[]>(() => withDefaults([]));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    repository
      .getByUser(LOCAL_USER_ID)
      .then((existing) => {
        if (!cancelled) setProfiles(withDefaults(existing));
      })
      .catch((err) => {
        console.error('Не удалось загрузить language profiles — используются дефолтные уровни:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- repository стабилен по контракту вызова хука
  }, []);

  const setLevel = useCallback(
    (language: LanguageCode, selectedLevel: CEFRLevel) => {
      setProfiles((prev) => {
        const current = prev.find((profile) => profile.language === language);
        const base = current ?? createDefaultLanguageProfile(LOCAL_USER_ID, language, selectedLevel);
        const next: LanguageProfile = { ...base, selectedLevel, updatedAt: new Date().toISOString() };
        repository.upsert(next).catch((err) => {
          console.error('Не удалось сохранить уровень языка — изменение осталось только в этой сессии:', err);
        });
        return prev.some((profile) => profile.language === language)
          ? prev.map((profile) => (profile.language === language ? next : profile))
          : [...prev, next];
      });
    },
    [repository],
  );

  const getLevel = useCallback(
    (language: LanguageCode): CEFRLevel =>
      profiles.find((profile) => profile.language === language)?.selectedLevel ?? DEFAULT_LEVEL_BY_LANGUAGE[language],
    [profiles],
  );

  return { profiles, loading, setLevel, getLevel };
}
