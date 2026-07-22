// Шаг 3 пайплайна — детерминированная токенизация, без AI.
//
// Разбиение на ПРЕДЛОЖЕНИЯ теперь языкозависимое — через Intl.Segmenter
// (ICU sentence-break правила конкретного bcp47-языка: сокращения, кавычки,
// регистр — там, где у ICU есть под это данные). Раньше был общий регэксп на
// ". ! ? …" + заглавная буква — ломался на сокращениях, кавычках и
// предложениях с маленькой буквы; для греческого — отдельная сложность:
// вопросительный знак там `;` (U+003B), тот же символ, что "точка с запятой"
// в остальных языках, и это ГРЕЧЕСКАЯ языковая условность, не Unicode-категория
// символа — Intl.Segmenter она тоже не гарантированно решает (UAX #29 не
// переопределяет символ по locale), это по-прежнему открытый вопрос для el,
// не решённый одним переключением на Segmenter (см. voiceVerified: false).
//
// Разбиение на ТОКЕНЫ (слова/пунктуация) остаётся общим для всех языков —
// юникодные категории \p{L}/\p{M}, а не латинские диапазоны, поэтому не
// требует per-language веток.
import type { Paragraph, Sentence, Token } from '../../src/types/lesson.js';

// Слово: буквы (с диакритикой) с необязательными внутренними апострофом/дефисом
// ("Saint-Lazare", "s'est", "qu'elle" — один токен). Пунктуация — всё остальное,
// посимвольно.
const TOKEN_PATTERN = /[\p{L}\p{M}]+(?:['''-][\p{L}\p{M}]+)*|[^\s\p{L}\p{M}]/gu;

function splitIntoSentencesFallback(paragraphText: string): string[] {
  return paragraphText
    .trim()
    .split(/(?<=[.!?…])\s+(?=\p{Lu})/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitIntoSentences(paragraphText: string, bcp47: string): string[] {
  const trimmed = paragraphText.trim();
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(bcp47, { granularity: 'sentence' });
    const segments = Array.from(segmenter.segment(trimmed), (s) => s.segment.trim()).filter(Boolean);
    if (segments.length > 0) return segments;
  }
  // Intl.Segmenter недоступен (старый рантайм) — регэксп-fallback.
  return splitIntoSentencesFallback(trimmed);
}

export function tokenizeParagraphs(paragraphTexts: string[], bcp47: string): Paragraph[] {
  let tokenCounter = 0;
  let sentenceCounter = 0;

  return paragraphTexts.map((paragraphText, pIndex): Paragraph => {
    const sentences: Sentence[] = splitIntoSentences(paragraphText, bcp47).map((sentenceText): Sentence => {
      const sentenceId = `s${++sentenceCounter}`;
      const matches = sentenceText.match(TOKEN_PATTERN) ?? [];
      const tokens: Token[] = matches.map((raw): Token => {
        const id = `t${++tokenCounter}`;
        const isWord = /\p{L}/u.test(raw);
        return {
          id,
          sentenceId,
          text: raw,
          normalized: raw.toLowerCase(),
          type: isWord ? 'word' : 'punctuation',
        };
      });
      return { id: sentenceId, text: sentenceText, tokens };
    });
    return { id: `p${pIndex + 1}`, sentences };
  });
}
