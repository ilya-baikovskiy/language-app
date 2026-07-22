// Сопоставление character timings ElevenLabs Forced Alignment с существующими
// tokenId. Источник истины для позиций — spans из buildLessonText (тот же
// текст, что был отправлен в API), а не повторное разбиение words — это важно
// для французских элизий/дефисов, где апостроф/дефис внутри токена уже один
// токен (см. tokenize.ts) и не должен ломать сопоставление.

import type { Token } from '../../src/types/lesson.js';
import type { TokenSpan } from '../../src/lib/lessonText.js';
import type { ElevenLabsCharacter } from './elevenLabsAudio.js';
import type { RecoveryEntry } from './timingRecovery.js';

export type MappedToken = { tokenId: string; displayText: string; startTime: number; endTime: number };
export type UnmappedToken = { tokenId: string; displayText: string; reason: string };

export type MappingResult = {
  mapped: MappedToken[];
  unmapped: UnmappedToken[];
  // Токены, чья граница была расширена до соседнего валидного символа —
  // см. комментарий у edge-snap ниже. Идёт в AlignmentReport как recovery
  // 'edge', а не молча теряется.
  edgeSnapped: RecoveryEntry[];
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
    return { mapped: [], unmapped, edgeSnapped: [], responseTextMatches: false };
  }

  const mapped: MappedToken[] = [];
  const unmapped: UnmappedToken[] = [];
  const edgeSnapped: RecoveryEntry[] = [];

  for (const span of wordSpans) {
    const token = tokensById.get(span.tokenId);
    if (!token) continue;
    const slice = characters.slice(span.start, span.end);

    let first: ElevenLabsCharacter | undefined;
    let last: ElevenLabsCharacter | undefined;
    let firstIdx = -1;
    let lastIdx = -1;
    slice.forEach((c, i) => {
      const valid = Number.isFinite(c.start) && Number.isFinite(c.end) && c.end >= c.start;
      if (!valid) return;
      if (!first) {
        first = c;
        firstIdx = i;
      }
      last = c;
      lastIdx = i;
    });

    if (!first || !last) {
      unmapped.push({ tokenId: span.tokenId, displayText: token.text, reason: 'no valid character timing found within token span' });
      continue;
    }

    // Ведущие/хвостовые символы токена невалидны (частый случай на лиэзонах и
    // диакритике — например «dé» в «découvrir»), а какие-то в середине — нет.
    // Резать по первому попавшемуся валидному символу ВНУТРИ слова нельзя: это
    // отрезает начало/конец слова от воспроизведения (découvrir → couvrir).
    // Вместо этого расширяем границу наружу — до конца/начала ближайшего
    // валидного символа СОСЕДНЕГО токена (или пробела/пунктуации между ними):
    // отрезок захватывает "лишнее" молчание, а не режет сам токен.
    let startTime = first.start;
    let snapped = false;
    if (firstIdx > 0) {
      const before = findValidBefore(characters, span.start);
      if (before) {
        startTime = before.end;
        snapped = true;
      }
    }
    let endTime = last.end;
    if (lastIdx < slice.length - 1) {
      const after = findValidAfter(characters, span.end);
      if (after) {
        endTime = after.start;
        snapped = true;
      }
    }

    mapped.push({ tokenId: span.tokenId, displayText: token.text, startTime: round3(startTime), endTime: round3(endTime) });
    if (snapped) edgeSnapped.push({ tokenId: span.tokenId, kind: 'edge' });
  }

  return { mapped, unmapped, edgeSnapped, responseTextMatches: true };
}

function isValidChar(c: ElevenLabsCharacter): boolean {
  return Number.isFinite(c.start) && Number.isFinite(c.end) && c.end >= c.start;
}

function findValidBefore(characters: ElevenLabsCharacter[], index: number): ElevenLabsCharacter | undefined {
  for (let i = index - 1; i >= 0; i--) {
    if (isValidChar(characters[i])) return characters[i];
  }
  return undefined;
}

function findValidAfter(characters: ElevenLabsCharacter[], index: number): ElevenLabsCharacter | undefined {
  for (let i = index; i < characters.length; i++) {
    if (isValidChar(characters[i])) return characters[i];
  }
  return undefined;
}
