import { describe, expect, it } from 'vitest';
import { mapCharactersToTokens } from '../mapCharactersToTokens.js';
import type { ElevenLabsCharacter } from '../elevenLabsAudio.js';
import type { Token } from '../../../src/types/lesson.js';
import type { TokenSpan } from '../../../src/lib/lessonText.js';

function char(text: string, start: number | null, end: number | null): ElevenLabsCharacter {
  // ElevenLabs помечает "не могу определить тайминг" через нечисловые
  // значения — null здесь синтетически подделывает это же поведение.
  return { text, start: start as unknown as number, end: end as unknown as number };
}

function word(id: string): Token {
  return { id, text: '', normalized: '', type: 'word', sentenceId: 's1' };
}

describe('mapCharactersToTokens — edge-snap (découvrir bug)', () => {
  // "va découvrir vite" — токен découvrir целиком, ведущие "dé" помечены
  // невалидными (частый случай на лиэзонах у ElevenLabs). До фикса код резал
  // границу по первому валидному символу ВНУТРИ токена ("c") — découvrir
  // звучало как couvrir. Теперь граница расширяется до конца соседнего
  // валидного символа (здесь — пробел перед découvrir).
  const sentText = 'va découvrir vite';
  const spans: TokenSpan[] = [
    { tokenId: 't0', start: 0, end: 2 }, // "va"
    { tokenId: 't1', start: 3, end: 12 }, // "découvrir"
    { tokenId: 't2', start: 13, end: 17 }, // "vite"
  ];
  const tokensById = new Map<string, Token>([
    ['t0', word('t0')],
    ['t1', word('t1')],
    ['t2', word('t2')],
  ]);

  const characters: ElevenLabsCharacter[] = [
    char('v', 0, 0.1),
    char('a', 0.1, 0.2),
    char(' ', 0.2, 0.25),
    char('d', null, null), // невалиден
    char('é', null, null), // невалиден
    char('c', 0.5, 0.55),
    char('o', 0.55, 0.6),
    char('u', 0.6, 0.65),
    char('v', 0.65, 0.7),
    char('r', 0.7, 0.75),
    char('i', 0.75, 0.8),
    char('r', 0.8, 0.85),
    char(' ', 0.85, 0.9),
    char('v', 0.9, 0.95),
    char('i', 0.95, 1.0),
    char('t', 1.0, 1.05),
    char('e', 1.05, 1.1),
  ];

  it('extends the start boundary to the neighboring valid character instead of cutting into the word', () => {
    const { mapped } = mapCharactersToTokens(characters, sentText, spans, tokensById);
    const decouvrir = mapped.find((m) => m.tokenId === 't1');
    expect(decouvrir).toBeDefined();
    // НЕ 0.5 (начало "c" — старое поведение, обрезающее "dé").
    expect(decouvrir!.startTime).toBe(0.25);
    expect(decouvrir!.endTime).toBe(0.85);
  });

  it('records the widened token as an edge recovery entry', () => {
    const { edgeSnapped } = mapCharactersToTokens(characters, sentText, spans, tokensById);
    expect(edgeSnapped).toContainEqual({ tokenId: 't1', kind: 'edge' });
  });

  it('does not snap a token whose own boundary characters are already valid', () => {
    const { mapped, edgeSnapped } = mapCharactersToTokens(characters, sentText, spans, tokensById);
    const va = mapped.find((m) => m.tokenId === 't0');
    expect(va).toEqual({ tokenId: 't0', displayText: '', startTime: 0, endTime: 0.2 });
    expect(edgeSnapped.some((e) => e.tokenId === 't0')).toBe(false);
  });
});

describe('mapCharactersToTokens — fully unmapped tokens ("pour" bug)', () => {
  it('leaves a token with no valid character timing out of mapped, without guessing a position', () => {
    const sentText = 'pour toi';
    const spans: TokenSpan[] = [
      { tokenId: 't0', start: 0, end: 4 }, // "pour" — весь диапазон невалиден
      { tokenId: 't1', start: 5, end: 8 }, // "toi"
    ];
    const tokensById = new Map<string, Token>([
      ['t0', word('t0')],
      ['t1', word('t1')],
    ]);
    const characters: ElevenLabsCharacter[] = [
      char('p', null, null),
      char('o', null, null),
      char('u', null, null),
      char('r', null, null),
      char(' ', 0.4, 0.45),
      char('t', 0.45, 0.5),
      char('o', 0.5, 0.55),
      char('i', 0.55, 0.6),
    ];

    const { mapped, unmapped, edgeSnapped } = mapCharactersToTokens(characters, sentText, spans, tokensById);
    expect(mapped.some((m) => m.tokenId === 't0')).toBe(false);
    expect(unmapped).toContainEqual({ tokenId: 't0', displayText: '', reason: 'no valid character timing found within token span' });
    expect(edgeSnapped.some((e) => e.tokenId === 't0')).toBe(false);
    expect(mapped.find((m) => m.tokenId === 't1')).toEqual({ tokenId: 't1', displayText: '', startTime: 0.45, endTime: 0.6 });
  });
});

describe('mapCharactersToTokens — response text mismatch', () => {
  it('refuses to guess positions when response text does not match sent text', () => {
    const sentText = 'bonjour';
    const spans: TokenSpan[] = [{ tokenId: 't0', start: 0, end: 7 }];
    const tokensById = new Map<string, Token>([['t0', word('t0')]]);
    const characters: ElevenLabsCharacter[] = [char('a', 0, 0.1), char('u', 0.1, 0.2)]; // не совпадает вообще

    const { mapped, unmapped, responseTextMatches } = mapCharactersToTokens(characters, sentText, spans, tokensById);
    expect(responseTextMatches).toBe(false);
    expect(mapped).toEqual([]);
    expect(unmapped).toHaveLength(1);
  });

  it('strips CRLF (\\r) before comparing — ElevenLabs returns CRLF, buildLessonText gives \\n', () => {
    const sentText = 'a\nb';
    const spans: TokenSpan[] = [
      { tokenId: 't0', start: 0, end: 1 },
      { tokenId: 't1', start: 2, end: 3 },
    ];
    const tokensById = new Map<string, Token>([
      ['t0', word('t0')],
      ['t1', word('t1')],
    ]);
    const characters: ElevenLabsCharacter[] = [
      char('a', 0, 0.1),
      char('\r', 0.1, 0.1),
      char('\n', 0.1, 0.2),
      char('b', 0.2, 0.3),
    ];

    const { responseTextMatches, mapped } = mapCharactersToTokens(characters, sentText, spans, tokensById);
    expect(responseTextMatches).toBe(true);
    expect(mapped).toHaveLength(2);
  });
});
