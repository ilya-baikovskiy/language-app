// Сопоставление character timings ElevenLabs Forced Alignment с существующими
// tokenId. Источник истины для позиций — spans из buildLessonText (тот же
// текст, что был отправлен в API), а не повторное разбиение words — это важно
// для французских элизий/дефисов, где апостроф/дефис внутри токена уже один
// токен (см. tokenize.ts) и не должен ломать сопоставление.

import type { Token } from '../../../src/types/lesson.js';
import type { TokenSpan } from '../../../src/lib/lessonText.js';
import type { ElevenLabsCharacter } from './elevenLabsClient.js';

export type MappedToken = { tokenId: string; displayText: string; startTime: number; endTime: number };
export type UnmappedToken = { tokenId: string; displayText: string; reason: string };

export type MappingResult = {
  mapped: MappedToken[];
  unmapped: UnmappedToken[];
  // Полное совпадение текста ответа (characters.map(c => c.text).join('')) с
  // отправленным text. Если false — mapped всегда пуст: позиционные догадки
  // при несовпадении текста запрещены (см. таск).
  responseTextMatches: boolean;
};

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function mapCharactersToTokens(
  rawCharacters: ElevenLabsCharacter[],
  sentText: string,
  spans: TokenSpan[],
  tokensById: Map<string, Token>,
): MappingResult {
  // ElevenLabs возвращает CRLF ('\r' перед каждым '\n'), тогда как sentText —
  // с обычным '\n' (см. buildLessonText). Это разница в стиле переноса строк,
  // а не в содержании: убираем '\r'-символы перед сравнением/индексацией, а не
  // разрешаем позиционные догадки при реальном несовпадении текста.
  const characters = rawCharacters.filter((c) => c.text !== '\r');
  const responseText = characters.map((c) => c.text).join('');
  const responseTextMatches = responseText === sentText;

  const wordSpans = spans.filter((span) => tokensById.get(span.tokenId)?.type === 'word');

  if (!responseTextMatches) {
    const unmapped = wordSpans.map((span) => ({
      tokenId: span.tokenId,
      displayText: tokensById.get(span.tokenId)?.text ?? '',
      reason: `response text does not match sent text (sent ${sentText.length} chars, got ${responseText.length} chars)`,
    }));
    return { mapped: [], unmapped, responseTextMatches: false };
  }

  const mapped: MappedToken[] = [];
  const unmapped: UnmappedToken[] = [];

  for (const span of wordSpans) {
    const token = tokensById.get(span.tokenId);
    if (!token) continue;
    const slice = characters.slice(span.start, span.end);

    let first: ElevenLabsCharacter | undefined;
    let last: ElevenLabsCharacter | undefined;
    for (const c of slice) {
      const valid = Number.isFinite(c.start) && Number.isFinite(c.end) && c.end >= c.start;
      if (!valid) continue;
      if (!first) first = c;
      last = c;
    }

    if (!first || !last) {
      unmapped.push({ tokenId: span.tokenId, displayText: token.text, reason: 'no valid character timing found within token span' });
      continue;
    }

    mapped.push({ tokenId: span.tokenId, displayText: token.text, startTime: round3(first.start), endTime: round3(last.end) });
  }

  return { mapped, unmapped, responseTextMatches: true };
}
