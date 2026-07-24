// Заменяет useSavedUnits.ts (localStorage) — сохранённые слова теперь в Blob
// под userId-namespace (см. api/user-state.ts, kind=saved-words), чтобы (а)
// работать между устройствами и (б) не потеряться, когда появится настоящий
// логин (namespace уже `users/{userId}/...`, см. записку про SRS в истории
// PROGRESS.md). Одноразовая миграция старых записей из localStorage — ниже.
//
// Тренировка (SRS-планировщик, экран повторения) — сознательно НЕ эта задача
// ("просто сохранять списки слов, тренировку доделаем потом"). ReviewState
// уже заполняется дефолтным стартовым значением на каждое слово, чтобы не
// мигрировать схему второй раз.

import { useCallback, useEffect, useRef, useState } from 'react';
import { BlobSavedWordRepository } from '../content-system/repositories/blobSavedWordRepository';
import { createInitialReviewState, type SavedWord } from '../content-system/savedWord';
import { LOCAL_USER_ID } from '../content-system/userTypes';
import type { SavedWordRepository } from '../content-system/repositories';

const LEGACY_STORAGE_KEY = 'context-reader:saved';
const MIGRATION_DONE_KEY = 'context-reader:saved-words-migrated-v1';

type LegacySavedUnit = {
  lessonId: string;
  tokenId: string;
  displayText: string;
  shortTranslation: string;
  savedAt: number;
};

export function wordId(lessonId: string, tokenId: string): string {
  return `${lessonId}:${tokenId}`;
}

const DEFAULT_REPOSITORY = new BlobSavedWordRepository();

export type SaveWordInput = {
  lessonId: string;
  tokenId: string;
  language: string;
  level?: string;
  surfaceForm: string;
  partOfSpeech?: string | null;
  translation: string;
  audioText?: string;
  contextSource?: string;
  contextTranslation?: string;
};

// Легаси-записи не знают свой язык (SavedUnit его не хранил, см. старый
// LearnPage.tsx join через lessonId) — при миграции честно помечаем язык как
// неизвестный конкретной строкой, а не угадываем 'fr'. Экран «Учить»
// фильтрует по activeLanguage, поэтому такая запись просто не попадёт ни в
// один язык, пока пользователь её явно не пересохранит — лучше молчаливая
// потеря видимости, чем неверная метка языка.
const LEGACY_UNKNOWN_LANGUAGE = 'unknown';

async function migrateLegacyIfNeeded(repository: SavedWordRepository): Promise<void> {
  if (typeof window === 'undefined') return;
  if (window.localStorage.getItem(MIGRATION_DONE_KEY)) return;
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    const legacy: LegacySavedUnit[] = raw ? JSON.parse(raw) : [];
    for (const unit of legacy) {
      const now = new Date(unit.savedAt || Date.now()).toISOString();
      const word: SavedWord = {
        id: wordId(unit.lessonId, unit.tokenId),
        userId: LOCAL_USER_ID,
        language: LEGACY_UNKNOWN_LANGUAGE,
        surfaceForm: unit.displayText,
        translation: unit.shortTranslation,
        lessonId: unit.lessonId,
        tokenId: unit.tokenId,
        review: createInitialReviewState(new Date(unit.savedAt || Date.now())),
        createdAt: now,
        updatedAt: now,
      };
      await repository.upsert(word);
    }
  } catch (err) {
    console.error('Миграция сохранённых слов из localStorage не удалась:', err);
    // не блокируем — если миграция упала, пробуем ещё раз в следующий заход
    // (флаг не ставим).
    return;
  }
  window.localStorage.setItem(MIGRATION_DONE_KEY, '1');
}

export function useSavedWords(repository: SavedWordRepository = DEFAULT_REPOSITORY) {
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
  const [loading, setLoading] = useState(true);
  const migratingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!migratingRef.current) {
        migratingRef.current = true;
        await migrateLegacyIfNeeded(repository);
      }
      const words = await repository.listByUser(LOCAL_USER_ID).catch((err) => {
        console.error('Не удалось загрузить сохранённые слова:', err);
        return [] as SavedWord[];
      });
      if (!cancelled) {
        setSavedWords(words);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const isSaved = useCallback(
    (lessonId: string, tokenId: string) => savedWords.some((w) => w.id === wordId(lessonId, tokenId)),
    [savedWords],
  );

  const toggleSave = useCallback(
    (input: SaveWordInput) => {
      const id = wordId(input.lessonId, input.tokenId);
      const alreadySaved = savedWords.some((w) => w.id === id);

      if (alreadySaved) {
        setSavedWords((prev) => prev.filter((w) => w.id !== id));
        repository.remove(LOCAL_USER_ID, id).catch((err) => {
          console.error('Не удалось удалить сохранённое слово:', err);
          // не откатываем оптимистичное обновление — повторный тап пересоздаст запись,
          // это не хуже прежнего localStorage-стаба по надёжности.
        });
        return;
      }

      const now = new Date().toISOString();
      const word: SavedWord = {
        id,
        userId: LOCAL_USER_ID,
        language: input.language,
        level: input.level,
        surfaceForm: input.surfaceForm,
        partOfSpeech: input.partOfSpeech ?? null,
        translation: input.translation,
        audioText: input.audioText,
        contextSource: input.contextSource,
        contextTranslation: input.contextTranslation,
        lessonId: input.lessonId,
        tokenId: input.tokenId,
        review: createInitialReviewState(),
        createdAt: now,
        updatedAt: now,
      };
      setSavedWords((prev) => [...prev, word]);
      repository.upsert(word).catch((err) => {
        console.error('Не удалось сохранить слово:', err);
      });
    },
    [savedWords, repository],
  );

  return { savedWords, loading, isSaved, toggleSave };
}
