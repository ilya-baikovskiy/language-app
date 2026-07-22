import { describe, expect, it } from 'vitest';
import { buildHint, HINT_IN_SENTENCE, HINT_OTHER_MEANING, isValidRelatedSpan } from '../generateAnnotations.js';
import type { Sentence, Token } from '../../../src/types/lesson.js';

// "Η Άννα πήγε στον σταθμό." — t1..t5 слова, t6 точка (пунктуация).
function makeToken(id: string, text: string, type: Token['type'] = 'word'): Token {
  return { id, text, normalized: text.toLowerCase(), type, sentenceId: 's1' };
}

const sentence: Sentence = {
  id: 's1',
  text: 'Η Άννα πήγε στον σταθμό.',
  tokens: [
    makeToken('t1', 'Η'),
    makeToken('t2', 'Άννα'),
    makeToken('t3', 'πήγε'),
    makeToken('t4', 'στον'),
    makeToken('t5', 'σταθμό'),
    makeToken('t6', '.', 'punctuation'),
  ],
};

describe('isValidRelatedSpan', () => {
  it('accepts a consecutive word span containing the target token', () => {
    expect(isValidRelatedSpan(sentence, 't4', ['t4', 't5'])).toBe(true);
  });

  it('accepts the span regardless of the order ids are given in', () => {
    expect(isValidRelatedSpan(sentence, 't4', ['t5', 't4'])).toBe(true);
  });

  it('rejects a span that does not include the target token', () => {
    expect(isValidRelatedSpan(sentence, 't3', ['t4', 't5'])).toBe(false);
  });

  it('rejects a single-token span', () => {
    expect(isValidRelatedSpan(sentence, 't4', ['t4'])).toBe(false);
  });

  it('rejects a non-consecutive span', () => {
    expect(isValidRelatedSpan(sentence, 't2', ['t2', 't4'])).toBe(false);
  });

  it('rejects a span that includes punctuation', () => {
    expect(isValidRelatedSpan(sentence, 't5', ['t5', 't6'])).toBe(false);
  });

  it('rejects an unknown token id', () => {
    expect(isValidRelatedSpan(sentence, 't4', ['t4', 'ghost'])).toBe(false);
  });
});

const NO_OTHER_MEANING = { otherMeaningSource: null, otherMeaningTranslation: null };

describe('buildHint', () => {
  it('labels a related span as the in-sentence hint', () => {
    expect(buildHint('στον σταθμό', 'на станцию', NO_OTHER_MEANING)).toEqual({
      label: HINT_IN_SENTENCE,
      source: 'στον σταθμό',
      translation: 'на станцию',
    });
  });

  it('falls back to the other-meaning hint when there is no related span', () => {
    expect(buildHint(null, null, { otherMeaningSource: 'Γιατί;', otherMeaningTranslation: 'Почему?' })).toEqual({
      label: HINT_OTHER_MEANING,
      source: 'Γιατί;',
      translation: 'Почему?',
    });
  });

  it('prefers the related span over the other meaning', () => {
    const hint = buildHint('στον σταθμό', 'на станцию', {
      otherMeaningSource: 'Γιατί;',
      otherMeaningTranslation: 'Почему?',
    });
    expect(hint?.label).toBe(HINT_IN_SENTENCE);
  });

  it('returns null when nothing worth showing came back', () => {
    expect(buildHint(null, null, NO_OTHER_MEANING)).toBeNull();
  });

  it('returns null when only one half of a pair is present', () => {
    expect(buildHint('στον σταθμό', null, NO_OTHER_MEANING)).toBeNull();
    expect(buildHint(null, null, { otherMeaningSource: 'Γιατί;', otherMeaningTranslation: null })).toBeNull();
  });

  it('never produces a "dictionary form" label', () => {
    const labels = [
      buildHint('στον σταθμό', 'на станцию', NO_OTHER_MEANING)?.label,
      buildHint(null, null, { otherMeaningSource: 'πηγαίνω', otherMeaningTranslation: 'идти' })?.label,
    ];
    expect(labels.every((label) => label !== 'Словарная форма')).toBe(true);
  });
});

