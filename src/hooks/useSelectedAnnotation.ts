import { useMemo } from 'react';
import type { Annotation, Lesson, Token } from '../types/lesson';

export type SheetSelection =
  | { kind: 'annotation'; annotation: Annotation }
  | { kind: 'fallback'; word: string; sentenceText: string };

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
// остаётся в ReaderState (selectedTokenId/selectedAnnotationId), а не в дублирующем
// объекте контента (раздел 16 ТЗ: эти значения нельзя схлопывать в одну переменную).
export function useSelectedAnnotation(
  lesson: Lesson,
  selectedTokenId: string | null,
  selectedAnnotationId: string | null,
): SheetSelection | null {
  return useMemo(() => {
    if (selectedAnnotationId) {
      const annotation = lesson.annotations.find((a) => a.id === selectedAnnotationId);
      if (annotation) return { kind: 'annotation', annotation };
    }
    if (selectedTokenId) {
      const found = findTokenAndSentenceText(lesson, selectedTokenId);
      if (found) return { kind: 'fallback', word: found.token.text, sentenceText: found.sentenceText };
    }
    return null;
  }, [lesson, selectedTokenId, selectedAnnotationId]);
}
