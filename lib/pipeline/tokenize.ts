// Шаг 3 пайплайна — детерминированная токенизация, без AI. Общая для всех
// языков: юникодное разбиение по буквам/пунктуации работает для французского,
// немецкого, английского и греческого без per-language веток (используем
// \p{L}/\p{Lu} юникодные категории, а не латинские диапазоны, — это и делает
// разбиение на предложения языконезависимым: заглавная буква после точки
// определяется по общей категории "буква в верхнем регистре", не по A-Z).

import type { Paragraph, Sentence, Token } from '../../src/types/lesson.ts';

// Слово: буквы (с диакритикой) с необязательными внутренними апострофом/дефисом
// ("Saint-Lazare", "s'est", "qu'elle" — один токен). Пунктуация — всё остальное,
// посимвольно.
const TOKEN_PATTERN = /[\p{L}\p{M}]+(?:['''-][\p{L}\p{M}]+)*|[^\s\p{L}\p{M}]/gu;

function splitIntoSentences(paragraphText: string): string[] {
  return paragraphText
    .trim()
    .split(/(?<=[.!?…])\s+(?=\p{Lu})/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function tokenizeParagraphs(paragraphTexts: string[]): Paragraph[] {
  let tokenCounter = 0;
  let sentenceCounter = 0;

  return paragraphTexts.map((paragraphText, pIndex): Paragraph => {
    const sentences: Sentence[] = splitIntoSentences(paragraphText).map((sentenceText): Sentence => {
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
