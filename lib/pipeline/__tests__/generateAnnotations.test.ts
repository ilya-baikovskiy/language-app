import { describe, expect, it } from 'vitest';
import { isValidRelatedSpan } from '../generateAnnotations.js';
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
