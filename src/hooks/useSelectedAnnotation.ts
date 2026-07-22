import { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveAnnotationTarget } from '../lib/lessonText';
import { fetchAnnotationBasic, fetchAnnotationDetails } from '../services/generation/lessonsApi';
import type { LanguageCode } from '../../lib/pipeline/languageConfig';
import type { Annotation, Lesson, Token } from '../types/lesson';

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
  | { kind: 'error'; displayText: string; sentenceText: string }
  | { kind: 'fallback'; word: string; sentenceText: string };

type FetchStatus = 'loading' | 'error';

function findTokenAndSentenceText(lesson: Lesson, tokenId: string): { token: Token; sentenceText: string } | null {
  for (const paragraph of lesson.paragraphs) {
    for (const sentence of paragraph.sentences) {
      const token = sentence.tokens.find((t) => t.id === tokenId);
      if (token) return { token, sentenceText: sentence.text };
    }
  }
  return null;
}

// Есть ли у аннотации контент второго тира. Предзаполненные уроки (sampleLesson)
// и уже дозагруженные аннотации проходят эту проверку — второй запрос им не
// нужен. Базовая (тир-1) аннотация из ленивого фетча её не проходит, пока
// пользователь не откроет «Подробнее».
function annotationHasDetails(a: Annotation): boolean {
  return (
    (a.examples?.length ?? 0) > 0 ||
    a.grammarSummary != null ||
    a.grammarDetails != null ||
    a.grammarLabel != null ||
    a.constructionExplanation != null ||
    a.formVariants != null ||
    (a.otherMeanings?.length ?? 0) > 0
  );
}

// Резолвит, что показывать в Bottom Sheet, по одним лишь id — источник истины
// остаётся в id-полях (selectedTokenId/selectedAnnotationId), а не в дублирующем
// объекте контента (раздел 16 ТЗ).
//
// Ленивая генерация в два тира (CLAUDE.md/PROGRESS.md): annotationId у токена
// проставлен на этапе генерации (stampAnnotationTargets), а контент тянется по
// клику. Тир 1 (базовое) — сразу при выборе слова; тир 2 (детали) — только
// когда пользователь жмёт «Подробнее» (loadDetails). Оба кэшируются на время
// сессии (без записи обратно в Blob — упрощение v1).
export function useSelectedAnnotation(
  lesson: Lesson,
  selectedTokenId: string | null,
  selectedAnnotationId: string | null,
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
    () => (selectedTokenId ? findTokenAndSentenceText(lesson, selectedTokenId) : null),
    [lesson, selectedTokenId],
  );

  const persistedAnnotation = selectedAnnotationId
    ? lesson.annotations.find((a) => a.id === selectedAnnotationId)
    : undefined;
  const cachedAnnotation = selectedAnnotationId ? cache[selectedAnnotationId] : undefined;
  // Кэш при наличии предпочтительнее: для сгенерированных уроков persisted нет
  // вовсе, а после дозагрузки деталей склеенная аннотация лежит именно в кэше.
  const resolvedAnnotation = cachedAnnotation ?? persistedAnnotation;

  const needsBasicFetch = !!selectedAnnotationId && !resolvedAnnotation && !!found?.token.annotationId;

  useEffect(() => {
    if (!needsBasicFetch || !selectedAnnotationId) return;
    const target = resolveAnnotationTarget(lesson, selectedAnnotationId);
    if (!target) return;

    let cancelled = false;
    setBasicStatusById((prev) => ({ ...prev, [selectedAnnotationId]: 'loading' }));

    fetchAnnotationBasic(target, lesson.level, lessonLanguage(lesson))
      .then((content) => {
        if (cancelled) return;
        const annotation: Annotation = { id: selectedAnnotationId, type: target.type, tokenIds: target.tokenIds, ...content };
        setCache((prev) => ({ ...prev, [selectedAnnotationId]: annotation }));
        setBasicStatusById((prev) => {
          const next = { ...prev };
          delete next[selectedAnnotationId];
          return next;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(`Не удалось объяснить "${target.displayText}":`, err);
        setBasicStatusById((prev) => ({ ...prev, [selectedAnnotationId]: 'error' }));
      });

    return () => {
      cancelled = true;
    };
    // retryNonce намеренно в зависимостях — заново запустить запрос после «Повторить».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsBasicFetch, selectedAnnotationId, lesson, retryNonce]);

  const detailsWanted = !!selectedAnnotationId && !!detailsWantedById[selectedAnnotationId];
  const needsDetailsFetch =
    !!selectedAnnotationId && detailsWanted && !!resolvedAnnotation && !annotationHasDetails(resolvedAnnotation);

  useEffect(() => {
    if (!needsDetailsFetch || !selectedAnnotationId) return;
    const target = resolveAnnotationTarget(lesson, selectedAnnotationId);
    if (!target) return;
    // База, на которую домёрживаем детали — уже разрешённая аннотация тир-1.
    const base = cache[selectedAnnotationId] ?? persistedAnnotation;
    if (!base) return;

    let cancelled = false;
    setDetailsStatusById((prev) => ({ ...prev, [selectedAnnotationId]: 'loading' }));

    fetchAnnotationDetails(target, lesson.level, lessonLanguage(lesson))
      .then((details) => {
        if (cancelled) return;
        setCache((prev) => ({ ...prev, [selectedAnnotationId]: { ...base, ...details } }));
        setDetailsStatusById((prev) => {
          const next = { ...prev };
          delete next[selectedAnnotationId];
          return next;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(`Не удалось загрузить детали "${target.displayText}":`, err);
        setDetailsStatusById((prev) => ({ ...prev, [selectedAnnotationId]: 'error' }));
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsDetailsFetch, selectedAnnotationId, lesson, detailsRetryNonce]);

  const retry = useCallback(() => setRetryNonce((n) => n + 1), []);

  const loadDetails = useCallback(() => {
    if (!selectedAnnotationId) return;
    setDetailsWantedById((prev) => ({ ...prev, [selectedAnnotationId]: true }));
  }, [selectedAnnotationId]);

  const retryDetails = useCallback(() => {
    if (!selectedAnnotationId) return;
    setDetailsStatusById((prev) => {
      const next = { ...prev };
      delete next[selectedAnnotationId];
      return next;
    });
    setDetailsRetryNonce((n) => n + 1);
  }, [selectedAnnotationId]);

  const selection = useMemo<SheetSelection | null>(() => {
    if (!selectedTokenId || !found) return null;

    if (selectedAnnotationId) {
      if (resolvedAnnotation) {
        const detailsStatus: DetailsStatus = annotationHasDetails(resolvedAnnotation)
          ? 'ready'
          : detailsStatusById[selectedAnnotationId] === 'loading'
            ? 'loading'
            : detailsStatusById[selectedAnnotationId] === 'error'
              ? 'error'
              : 'idle';
        return { kind: 'annotation', annotation: resolvedAnnotation, sentenceText: found.sentenceText, detailsStatus };
      }
      if (found.token.annotationId) {
        const target = resolveAnnotationTarget(lesson, selectedAnnotationId);
        const displayText = target?.displayText ?? found.token.text;
        if (basicStatusById[selectedAnnotationId] === 'error') {
          return { kind: 'error', displayText, sentenceText: found.sentenceText };
        }
        return { kind: 'loading', displayText, sentenceText: found.sentenceText };
      }
    }

    return { kind: 'fallback', word: found.token.text, sentenceText: found.sentenceText };
  }, [lesson, selectedTokenId, selectedAnnotationId, found, resolvedAnnotation, basicStatusById, detailsStatusById]);

  return { selection, retry, loadDetails, retryDetails };
}
