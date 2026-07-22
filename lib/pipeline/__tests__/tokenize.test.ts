import { describe, expect, it } from 'vitest';
import { tokenizeParagraphs } from '../tokenize.js';

describe('tokenizeParagraphs', () => {
  it('splits French text into sentences and keeps elisions/hyphenated names as one token', () => {
    const [paragraph] = tokenizeParagraphs(["Elle s'est levée tôt. Il habite à Saint-Lazare."], 'fr-FR');
    expect(paragraph.sentences).toHaveLength(2);
    const words = paragraph.sentences.flatMap((s) => s.tokens.filter((t) => t.type === 'word').map((t) => t.text));
    expect(words).toContain("s'est");
    expect(words).toContain('Saint-Lazare');
  });

  it('tokenizes German text into sentences and words', () => {
    const [paragraph] = tokenizeParagraphs(['Der Hund läuft schnell. Die Katze schläft.'], 'de-DE');
    expect(paragraph.sentences).toHaveLength(2);
    const words = paragraph.sentences.flatMap((s) => s.tokens.filter((t) => t.type === 'word').map((t) => t.text));
    expect(words).toContain('läuft');
  });

  it('tokenizes English text into sentences', () => {
    const [paragraph] = tokenizeParagraphs(['The cat sat. The dog ran.'], 'en-US');
    expect(paragraph.sentences).toHaveLength(2);
  });

  it('tokenizes Greek text into unicode word tokens', () => {
    // Известное ограничение (см. комментарий в tokenize.ts): греческий
    // вопросительный знак — это ';' (U+003B), тот же символ, что "точка с
    // запятой" везде ещё — это языковая условность, не Unicode-категория
    // символа, и Intl.Segmenter её не гарантированно решает. Тест проверяет
    // только базовую юникодную токенизацию греческих слов, не этот кейс.
    const [paragraph] = tokenizeParagraphs(['Ο σκύλος τρέχει γρήγορα.'], 'el-GR');
    const words = paragraph.sentences.flatMap((s) => s.tokens.filter((t) => t.type === 'word').map((t) => t.text));
    expect(words).toContain('σκύλος');
    expect(words).toContain('τρέχει');
  });

  it('assigns unique sequential ids across paragraphs and sentences', () => {
    const paragraphs = tokenizeParagraphs(['Un mot.', 'Deux mots ici.'], 'fr-FR');
    const tokenIds = paragraphs.flatMap((p) => p.sentences.flatMap((s) => s.tokens.map((t) => t.id)));
    const sentenceIds = paragraphs.flatMap((p) => p.sentences.map((s) => s.id));
    expect(new Set(tokenIds).size).toBe(tokenIds.length);
    expect(new Set(sentenceIds).size).toBe(sentenceIds.length);
  });

  it('tokenizes digits as individual punctuation-type characters, not word tokens', () => {
    // TOKEN_PATTERN матчит буквенные последовательности ИЛИ один
    // не-буквенный символ — цифры не \p{L}, поэтому "25" распадается на "2" и
    // "5" по отдельности, оба type:'punctuation'. Это ровно то расхождение,
    // из-за которого раньше ломался buildLessonText (эвристика "пробел перед
    // словом" не совпадала с реальным текстом на цифрах) — фикс был не здесь,
    // в lessonText.ts, но само поведение токенайзера стоит зафиксировать тестом.
    const [paragraph] = tokenizeParagraphs(['Il a 25 ans.'], 'fr-FR');
    const digitTokens = paragraph.sentences[0].tokens.filter((t) => /\d/.test(t.text));
    expect(digitTokens.length).toBeGreaterThan(0);
    expect(digitTokens.every((t) => t.type === 'punctuation')).toBe(true);
  });
});
