import { findWordAlignedIndex } from './wordAlign';
import type { SavedWord } from '../content-system/savedWord';

function sentenceSegments(text: string | undefined, locale: string): string[] {
  if (!text?.trim()) return [];
  if (typeof Intl.Segmenter !== 'function') return [text.trim()];
  return Array.from(new Intl.Segmenter(locale, { granularity: 'sentence' }).segment(text))
    .map((segment) => segment.segment.trim())
    .filter(Boolean);
}

export function selectSourcePracticeContext(
  word: SavedWord,
  sourceLocale: string,
): { source?: string; translation?: string } {
  const sources = sentenceSegments(word.contextSource, sourceLocale);
  if (sources.length === 0) {
    return {
      source: word.contextSource,
      translation: word.contextTranslation,
    };
  }

  const sourceIndex = sources.findIndex(
    (sentence) => findWordAlignedIndex(sentence, word.surfaceForm) !== -1,
  );
  const index = sourceIndex === -1 ? 0 : sourceIndex;
  const translations = sentenceSegments(word.contextTranslation, 'ru');
  return {
    source: sources[index],
    translation: translations[index] ?? word.contextTranslation,
  };
}
