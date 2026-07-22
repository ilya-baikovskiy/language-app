// Сравнительные метрики двух источников таймкодов. Чистые функции, без сети —
// используются и CLI-скриптом (runEval.ts), и (через сгенерированный
// comparison.json) preview-страницей.
//
// computeCoverage переехал в lib/pipeline/alignmentReport.ts — им же теперь
// пользуется прод-пайплайн для quality gate перед сохранением урока (см.
// AlignmentReport). Здесь остаётся только то, что специфично именно сравнению
// двух провайдеров на одном тексте (PairedDiff и подсчёт перцентилей).

import type { Token } from '../../../src/types/lesson.js';
import type { TimedToken } from '../../../lib/pipeline/alignmentReport.js';

export { computeCoverage } from '../../../lib/pipeline/alignmentReport.js';
export type { CoverageReport, TimedToken } from '../../../lib/pipeline/alignmentReport.js';

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
