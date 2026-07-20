import { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveAnnotationTarget } from '../lib/lessonText';
import { fetchAnnotationContent } from '../services/generation/lessonsApi';
import type { Annotation, Lesson, Token } from '../types/lesson';

export type SheetSelection =
  | { kind: 'annotation'; annotation: Annotation; sentenceText: string }
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

// Резолвит, что показывать в Bottom Sheet, по одним лишь id — источник истины
// остаётся в id-полях (selectedTokenId/selectedAnnotationId), а не в дублирующем
// объекте контента (раздел 16 ТЗ: эти значения нельзя схлопывать в одну переменную).
//
// С переходом на ленивую генерацию (CLAUDE.md/PROGRESS.md) хук перестал быть
// чистым useMemo: annotationId у токена появляется уже на этапе генерации
// (stampAnnotationTargets), а сам контент — только по клику. Если id есть, а
// ни в lesson.annotations (предзаполненные уроки вроде sampleLesson), ни в
// сессионном кэше этого хука объяснения ещё нет — хук сам запрашивает
// /api/generate-annotation и кэширует результат на время сессии (без записи
// обратно в Blob — намеренное упрощение v1, см. PROGRESS.md).
export function useSelectedAnnotation(
  lesson: Lesson,
  selectedTokenId: string | null,
  selectedAnnotationId: string | null,
): { selection: SheetSelection | null; retry: () => void } {
  const [cache, setCache] = useState<Record<string, Annotation>>({});
  const [statusById, setStatusById] = useState<Record<string, FetchStatus>>({});
  const [retryNonce, setRetryNonce] = useState(0);

  const found = useMemo(
    () => (selectedTokenId ? findTokenAndSentenceText(lesson, selectedTokenId) : null),
    [lesson, selectedTokenId],
  );

  const persistedAnnotation = selectedAnnotationId
    ? lesson.annotations.find((a) => a.id === selectedAnnotationId)
    : undefined;
  const cachedAnnotation = selectedAnnotationId ? cache[selectedAnnotationId] : undefined;
  const resolvedAnnotation = persistedAnnotation ?? cachedAnnotation;

  const needsFetch = !!selectedAnnotationId && !resolvedAnnotation && !!found?.token.annotationId;

  useEffect(() => {
    if (!needsFetch || !selectedAnnotationId) return;
    const target = resolveAnnotationTarget(lesson, selectedAnnotationId);
    if (!target) return;

    let cancelled = false;
    setStatusById((prev) => ({ ...prev, [selectedAnnotationId]: 'loading' }));

    fetchAnnotationContent(target, lesson.level)
      .then((content) => {
        if (cancelled) return;
        const annotation: Annotation = { id: selectedAnnotationId, type: target.type, tokenIds: target.tokenIds, ...content };
        setCache((prev) => ({ ...prev, [selectedAnnotationId]: annotation }));
        setStatusById((prev) => {
          const next = { ...prev };
          delete next[selectedAnnotationId];
          return next;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(`Не удалось объяснить "${target.displayText}":`, err);
        setStatusById((prev) => ({ ...prev, [selectedAnnotationId]: 'error' }));
      });

    return () => {
      cancelled = true;
    };
    // retryNonce намеренно в зависимостях — это единственная его роль, заново
    // запустить этот же запрос после клика на «Повторить».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsFetch, selectedAnnotationId, lesson, retryNonce]);

  const retry = useCallback(() => setRetryNonce((n) => n + 1), []);

  const selection = useMemo<SheetSelection | null>(() => {
    if (!selectedTokenId || !found) return null;

    if (selectedAnnotationId) {
      if (resolvedAnnotation) {
        return { kind: 'annotation', annotation: resolvedAnnotation, sentenceText: found.sentenceText };
      }
      if (found.token.annotationId) {
        const target = resolveAnnotationTarget(lesson, selectedAnnotationId);
        const displayText = target?.displayText ?? found.token.text;
        if (statusById[selectedAnnotationId] === 'error') {
          return { kind: 'error', displayText, sentenceText: found.sentenceText };
        }
        return { kind: 'loading', displayText, sentenceText: found.sentenceText };
      }
    }

    return { kind: 'fallback', word: found.token.text, sentenceText: found.sentenceText };
  }, [lesson, selectedTokenId, selectedAnnotationId, found, resolvedAnnotation, statusById]);

  return { selection, retry };
}
