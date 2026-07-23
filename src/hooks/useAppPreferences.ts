// Глобальный activeLanguage + общие темы/страны — см.
// docs/content-system-v1.2/16_APPROVED_MOBILE_UX_AND_NAVIGATION.md §4/§8/§14.
//
// Persistence через BlobAppPreferencesRepository (см. content-system/repositories/
// blobAppPreferencesRepository.ts) — тот же Blob-через-API путь, что выбран в
// PR 1. Если сеть/API недоступны (например, простой `npm run dev` без
// `vercel dev` — serverless-функции не поднимаются), хук не роняет приложение:
// работает с локальным дефолтом в памяти, ошибка логируется один раз, как и
// в остальных местах кодовой базы (см. LibraryPage.tsx — тот же паттерн
// «показать rетрай, не сломать экран»).

import { useCallback, useEffect, useRef, useState } from 'react';
import { LOCAL_USER_ID, createDefaultAppPreferences, type AppPreferences } from '../content-system/userTypes';
import { BlobAppPreferencesRepository } from '../content-system/repositories/blobAppPreferencesRepository';
import type { AppPreferencesRepository } from '../content-system/repositories';
import type { LanguageCode } from '../../lib/pipeline/languageConfig';

// Дефолт продукта: французский — исторически первый и единственный
// полностью проверенный язык пайплайна (см. PROGRESS.md). Решение принято
// самостоятельно — документ 16 не фиксирует дефолтный activeLanguage для
// нового пользователя, только уровни существующих 4 языков прототипа.
const DEFAULT_ACTIVE_LANGUAGE: LanguageCode = 'fr';

export function useAppPreferences(repository: AppPreferencesRepository = new BlobAppPreferencesRepository()) {
  const [preferences, setPreferences] = useState<AppPreferences>(() =>
    createDefaultAppPreferences(LOCAL_USER_ID, DEFAULT_ACTIVE_LANGUAGE),
  );
  const [loading, setLoading] = useState(true);
  const persistedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    repository
      .get(LOCAL_USER_ID)
      .then((existing) => {
        if (cancelled) return;
        if (existing) {
          setPreferences(existing);
          persistedRef.current = true;
        }
      })
      .catch((err) => {
        console.error('Не удалось загрузить app preferences — используется локальный дефолт:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- repository стабилен по контракту вызова хука
  }, []);

  const persist = useCallback(
    (next: AppPreferences) => {
      repository
        .upsert(next)
        .then((saved) => {
          persistedRef.current = true;
          setPreferences(saved);
        })
        .catch((err) => {
          console.error('Не удалось сохранить app preferences — изменение осталось только в этой сессии:', err);
        });
    },
    [repository],
  );

  const setActiveLanguage = useCallback(
    (language: LanguageCode) => {
      setPreferences((prev) => {
        const next: AppPreferences = { ...prev, activeLanguage: language, updatedAt: new Date().toISOString() };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setEnabledTopicIds = useCallback(
    (topicIds: string[]) => {
      setPreferences((prev) => {
        const next: AppPreferences = { ...prev, enabledTopicIds: topicIds, updatedAt: new Date().toISOString() };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setEnabledCountryOrRegionIds = useCallback(
    (countryOrRegionIds: string[]) => {
      setPreferences((prev) => {
        const next: AppPreferences = {
          ...prev,
          enabledCountryOrRegionIds: countryOrRegionIds,
          updatedAt: new Date().toISOString(),
        };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return {
    preferences,
    loading,
    activeLanguage: (preferences.activeLanguage as LanguageCode) || DEFAULT_ACTIVE_LANGUAGE,
    setActiveLanguage,
    setEnabledTopicIds,
    setEnabledCountryOrRegionIds,
  };
}
