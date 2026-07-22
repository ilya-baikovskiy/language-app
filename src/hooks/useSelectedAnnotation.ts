import { useCallback, useEffect, useMemo, useState } from 'react';
import { findTokenAndSentence } from '../lib/lessonText';
import { fetchAnnotationBasic, fetchAnnotationDetails } from '../services/generation/lessonsApi';
import type { LanguageCode } from '../../lib/pipeline/languageConfig';
import type { Annotation, Lesson } from '../types/lesson';

// lesson.languageCode — свободная строка (см. types/lesson.ts), но по
// построению всегда одно из значений LanguageCode — мы сами его туда пишем.
function lessonLanguage(lesson: Lesson): LanguageCode {
  return (lesson.languageCode as LanguageCode | undefined) ?? 'fr';
}

// Статус второго тира (детали за «Подробнее»): idle — ещё не запрашивали;
// loading — грузим; ready — детали уже есть (в кэше, в предзаполненном уроке
// или после дозагрузки); error — упало.
export type DetailsStatus = 'idle' | 'loading' | 'ready' | 'error';

export type SheetSelection =
  | { kind: 'annotation'; annotation: Annotation; sentenceText: string; detailsStatus: DetailsStatus }
  | { kind: 'loading'; displayText: string; sentenceText: string }
  | { kind: 'error'; displayText: string; sentenceText: string };

type FetchStatus = 'loading' | 'error';

// Резолвит, что показывать в Bottom Sheet, по одному id — Bottom Sheet v2:
// каждый word-токен кликабелен сам по себе, annotation.id === token.id
// напрямую (нет больше составного annotationId фразовой группы, а значит и
// отдельного параметра selectedAnnotationId).
//
// Ленивая генерация в два тира (CLAUDE.md/PROGRESS.md): тир 1 (базовое) —
// сразу при выборе слова; тир 2 (детали) — только когда пользователь жмёт
// «Подробнее» (loadDetails). Оба кэшируются на время сессии (без записи
// обратно в Blob — упрощение v1).
export function useSelectedAnnotation(
  lesson: Lesson,
  selectedTokenId: string | null,
): {
  selection: SheetSelection | null;
  retry: () => void;
  loadDetails: () => void;
  retryDetails: () => void;
} {
  const [cache, setCache] = useState<Record<string, Annotation>>({});
  const [basicStatusById, setBasicStatusById] = useState<Record<string, FetchStatus>>({});
  const [detailsStatusById, setDetailsStatusById] = useState<Record<string, FetchStatus>>({});
  const [detailsWantedById, setDetailsWantedById] = useState<Record<string, boolean>>({});
  const [retryNonce, setRetryNonce] = useState(0);
  const [detailsRetryNonce, setDetailsRetryNonce] = useState(0);

  const found = useMemo(
    () => (selectedTokenId ? findTokenAndSentence(lesson, selectedTokenId) : null),
    [lesson, selectedTokenId],
  );

  const persistedAnnotation = selectedTokenId ? lesson.annotations.find((a) => a.id === selectedTokenId) : undefined;
  const cachedAnnotation = selectedTokenId ? cache[selectedTokenId] : undefined;
  // Кэш при наличии предпочтительнее: для сгенерированных уроков persisted нет
  // вовсе, а после дозагрузки деталей склеенная аннотация лежит именно в кэше.
  const resolvedAnnotation = cachedAnnotation ?? persistedAnnotation;

  const needsBasicFetch = !!selectedTokenId && !!found && !resolvedAnnotation;

  useEffect(() => {
    if (!needsBasicFetch || !selectedTokenId || !found) return;

    let cancelled = false;
    setBasicStatusById((prev) => ({ ...prev, [selectedTokenId]: 'loading' }));

    fetchAnnotationBasic({ tokenId: selectedTokenId, sentence: found.sentence }, lesson.level, lessonLanguage(lesson))
      .then((summary) => {
        if (cancelled) return;
        const annotation: Annotation = { id: selectedTokenId, summary };
        setCache((prev) => ({ ...prev, [selectedTokenId]: annotation }));
        setBasicStatusById((prev) => {
          const next = { ...prev };
          delete next[selectedTokenId];
          return next;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(`Не удалось объяснить "${found.token.text}":`, err);
        setBasicStatusById((prev) => ({ ...prev, [selectedTokenId]: 'error' }));
      });

    return () => {
      cancelled = true;
    };
    // retryNonce намеренно в зависимостях — заново запустить запрос после «Повторить».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsBasicFetch, selectedTokenId, found, lesson, retryNonce]);

  const detailsWanted = !!selectedTokenId && !!detailsWantedById[selectedTokenId];
  const needsDetailsFetch = detailsWanted && !!resolvedAnnotation && !resolvedAnnotation.details;

  useEffect(() => {
    if (!needsDetailsFetch || !selectedTokenId || !found) return;
    // База, на которую домёрживаем детали — уже разрешённая аннотация тир-1.
    const base = cache[selectedTokenId] ?? persistedAnnotation;
    if (!base) return;

    let cancelled = false;
    setDetailsStatusById((prev) => ({ ...prev, [selectedTokenId]: 'loading' }));

    fetchAnnotationDetails({ tokenId: selectedTokenId, sentence: found.sentence }, lesson.level, lessonLanguage(lesson))
      .then((details) => {
        if (cancelled) return;
        setCache((prev) => ({ ...prev, [selectedTokenId]: { ...base, details } }));
        setDetailsStatusById((prev) => {
          const next = { ...prev };
          delete next[selectedTokenId];
          return next;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(`Не удалось загрузить детали "${found.token.text}":`, err);
        setDetailsStatusById((prev) => ({ ...prev, [selectedTokenId]: 'error' }));
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsDetailsFetch, selectedTokenId, found, lesson, detailsRetryNonce]);

  const retry = useCallback(() => setRetryNonce((n) => n + 1), []);

  const loadDetails = useCallback(() => {
    if (!selectedTokenId) return;
    setDetailsWantedById((prev) => ({ ...prev, [selectedTokenId]: true }));
  }, [selectedTokenId]);

  const retryDetails = useCallback(() => {
    if (!selectedTokenId) return;
    setDetailsStatusById((prev) => {
      const next = { ...prev };
      delete next[selectedTokenId];
      return next;
    });
    setDetailsRetryNonce((n) => n + 1);
  }, [selectedTokenId]);

  const selection = useMemo<SheetSelection | null>(() => {
    if (!selectedTokenId || !found) return null;

    if (resolvedAnnotation) {
      const detailsStatus: DetailsStatus = resolvedAnnotation.details
        ? 'ready'
        : detailsStatusById[selectedTokenId] === 'loading'
          ? 'loading'
          : detailsStatusById[selectedTokenId] === 'error'
            ? 'error'
            : 'idle';
      return { kind: 'annotation', annotation: resolvedAnnotation, sentenceText: found.sentence.text, detailsStatus };
    }

    if (basicStatusById[selectedTokenId] === 'error') {
      return { kind: 'error', displayText: found.token.text, sentenceText: found.sentence.text };
    }
    return { kind: 'loading', displayText: found.token.text, sentenceText: found.sentence.text };
  }, [selectedTokenId, found, resolvedAnnotation, basicStatusById, detailsStatusById]);

  return { selection, retry, loadDetails, retryDetails };
}
