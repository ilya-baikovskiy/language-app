// Сравнительные метрики двух источников таймкодов. Чистые функции, без сети —
// используются и CLI-скриптом (runEval.ts), и (через сгенерированный
// comparison.json) preview-страницей.

import type { Token } from '../../../src/types/lesson.js';

export type TimedToken = { tokenId: string; displayText: string; startTime: number; endTime: number };

export type CoverageReport = {
  totalWordTokens: number;
  coveredCount: number;
  coveragePct: number;
  unmappedTokenIds: string[];
  monotonicityViolations: { tokenId: string; prevTokenId: string }[];
  overlapViolations: { tokenId: string; prevTokenId: string; overlapSeconds: number }[];
  shortOrZeroDurationTokens: { tokenId: string; displayText: string; durationSeconds: number }[];
  firstWordStart: number | null;
  lastWordEnd: number | null;
};

const SHORT_DURATION_THRESHOLD_SECONDS = 0.03;

// orderedWordTokenIds — порядок чтения (см. orderedWordTokenIds в lessonText.ts).
export function computeCoverage(orderedWordTokenIds: string[], timedById: Map<string, TimedToken>): CoverageReport {
  const unmappedTokenIds: string[] = [];
  const monotonicityViolations: CoverageReport['monotonicityViolations'] = [];
  const overlapViolations: CoverageReport['overlapViolations'] = [];
  const shortOrZeroDurationTokens: CoverageReport['shortOrZeroDurationTokens'] = [];

  let prevTokenId: string | null = null;
  let prevEnd: number | null = null;
  let firstWordStart: number | null = null;
  let lastWordEnd: number | null = null;

  for (const tokenId of orderedWordTokenIds) {
    const timed = timedById.get(tokenId);
    if (!timed) {
      unmappedTokenIds.push(tokenId);
      continue;
    }

    if (firstWordStart === null) firstWordStart = timed.startTime;
    lastWordEnd = timed.endTime;

    const duration = timed.endTime - timed.startTime;
    if (duration < SHORT_DURATION_THRESHOLD_SECONDS) {
      shortOrZeroDurationTokens.push({ tokenId, displayText: timed.displayText, durationSeconds: round3(duration) });
    }

    if (prevEnd !== null && prevTokenId) {
      if (timed.startTime < prevEnd - SHORT_DURATION_THRESHOLD_SECONDS) {
        // Заметный overlap (не просто округление на стыке слов).
        overlapViolations.push({ tokenId, prevTokenId, overlapSeconds: round3(prevEnd - timed.startTime) });
      }
      if (timed.startTime < (timedById.get(prevTokenId)?.startTime ?? -Infinity)) {
        monotonicityViolations.push({ tokenId, prevTokenId });
      }
    }

    prevTokenId = tokenId;
    prevEnd = timed.endTime;
  }

  const coveredCount = orderedWordTokenIds.length - unmappedTokenIds.length;
  return {
    totalWordTokens: orderedWordTokenIds.length,
    coveredCount,
    coveragePct: orderedWordTokenIds.length === 0 ? 0 : round1((coveredCount / orderedWordTokenIds.length) * 100),
    unmappedTokenIds,
    monotonicityViolations,
    overlapViolations,
    shortOrZeroDurationTokens,
    firstWordStart,
    lastWordEnd,
  };
}

export type PairedDiff = {
  tokenId: string;
  displayText: string;
  whisperStart: number;
  whisperEnd: number;
  elevenStart: number;
  elevenEnd: number;
  startDiff: number;
  endDiff: number;
  maxDiff: number;
  flags: {
    hasApostrophe: boolean;
    hasHyphen: boolean;
    hasDigit: boolean;
    isShortFunctionWord: boolean;
    looksLikeProperNoun: boolean;
  };
};

function tagToken(text: string, isSentenceInitial: boolean): PairedDiff['flags'] {
  return {
    hasApostrophe: /['']/.test(text),
    hasHyphen: text.includes('-'),
    hasDigit: /\d/.test(text),
    isShortFunctionWord: text.length <= 3 && text === text.toLowerCase(),
    looksLikeProperNoun: !isSentenceInitial && /^\p{Lu}/u.test(text),
  };
}

export function computePairedDiffs(
  orderedWordTokenIds: string[],
  whisperById: Map<string, TimedToken>,
  elevenById: Map<string, TimedToken>,
  tokensById: Map<string, Token>,
  sentenceInitialTokenIds: Set<string>,
): PairedDiff[] {
  const diffs: PairedDiff[] = [];
  for (const tokenId of orderedWordTokenIds) {
    const w = whisperById.get(tokenId);
    const e = elevenById.get(tokenId);
    if (!w || !e) continue;
    const token = tokensById.get(tokenId);
    const text = token?.text ?? w.displayText;
    const startDiff = round3(Math.abs(w.startTime - e.startTime));
    const endDiff = round3(Math.abs(w.endTime - e.endTime));
    diffs.push({
      tokenId,
      displayText: text,
      whisperStart: w.startTime,
      whisperEnd: w.endTime,
      elevenStart: e.startTime,
      elevenEnd: e.endTime,
      startDiff,
      endDiff,
      maxDiff: Math.max(startDiff, endDiff),
      flags: tagToken(text, sentenceInitialTokenIds.has(tokenId)),
    });
  }
  return diffs;
}

export function percentile(sortedAscending: number[], p: number): number {
  if (sortedAscending.length === 0) return 0;
  const idx = Math.min(sortedAscending.length - 1, Math.ceil((p / 100) * sortedAscending.length) - 1);
  return sortedAscending[Math.max(0, idx)];
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
