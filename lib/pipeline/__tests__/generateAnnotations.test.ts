import { describe, expect, it } from 'vitest';
import { dropSelfHighlight, isValidRelatedSpan } from '../generateAnnotations.js';
import type { DetailSection, Sentence, Token } from '../../../src/types/lesson.js';

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

function table(rows: string[][], highlightRow: number | null): DetailSection {
  return { type: 'table', title: null, columns: ['лицо', 'греческий'], rows, highlightRow };
}

describe('dropSelfHighlight', () => {
  const rows = [
    ['я', 'πήγα'],
    ['ты', 'πήγες'],
    ['он / она', 'πήγε'],
  ];

  it('clears a highlight that points at the clicked form', () => {
    const [section] = dropSelfHighlight([table(rows, 2)], 'πήγε') as [Extract<DetailSection, { type: 'table' }>];
    expect(section.highlightRow).toBeNull();
  });

  it('matches case-insensitively', () => {
    const [section] = dropSelfHighlight([table(rows, 2)], 'ΠΉΓΕ') as [Extract<DetailSection, { type: 'table' }>];
    expect(section.highlightRow).toBeNull();
  });

  it('keeps a highlight on a row that is not the clicked form', () => {
    const [section] = dropSelfHighlight([table(rows, 0)], 'πήγε') as [Extract<DetailSection, { type: 'table' }>];
    expect(section.highlightRow).toBe(0);
  });

  it('does not treat the target as a match when it is only a substring of a longer form', () => {
    const [section] = dropSelfHighlight([table([['они', 'πήγαν']], 0)], 'πήγα') as [
      Extract<DetailSection, { type: 'table' }>,
    ];
    expect(section.highlightRow).toBe(0);
  });

  it('clears an out-of-range highlight index', () => {
    const [section] = dropSelfHighlight([table(rows, 9)], 'πήγε') as [Extract<DetailSection, { type: 'table' }>];
    expect(section.highlightRow).toBeNull();
  });

  it('leaves non-table sections untouched', () => {
    const sections: DetailSection[] = [{ type: 'grammarNote', body: 'аорист' }];
    expect(dropSelfHighlight(sections, 'πήγε')).toEqual(sections);
  });
});
