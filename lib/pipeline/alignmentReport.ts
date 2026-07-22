// Отчёт о качестве выравнивания одного урока + порог публикации. Используется
// и в проде (api/generate-audio.ts перед сохранением урока), и в eval-стенде
// (evals/audio-alignment — сравнение Whisper/ElevenLabs на одном тексте) —
// поэтому coverage-метрика (computeCoverage) живёт здесь одна, а не
// дублируется в двух местах.

import type { AudioProvider, Token } from '../../src/types/lesson.js';
import type { RecoveryEntry, TimedRange } from './timingRecovery.js';

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

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

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

export type AlignmentReport = {
  provider: AudioProvider;
  voiceId: string;
  modelId: string;
  speed?: number;
  totalWords: number;
  // Тайминги, которые провайдер дал сам, без вмешательства recovery-слоя.
  timedDirectly: number;
  recovered: { edge: number; interpolated: number; stretched: number; clamped: number; guessed: number };
  coveragePct: number;
  monotonicityViolations: number;
  maxGapSeconds: number;
  generatedAt: string;
};

export type QualityGateResult = { passed: true } | { passed: false; reason: string };

const MIN_DIRECT_COVERAGE_PCT = 95;
const MAX_RECOVERED_SHARE_PCT = 10;

// Не пускаем в сохранение урок, где recovery-слою пришлось нести основную
// нагрузку — это сигнал, что с самим провайдером/текстом что-то не так,
// а не что несколько отдельных слов не повезло.
export function evaluateQualityGate(report: AlignmentReport): QualityGateResult {
  const directPct = report.totalWords === 0 ? 100 : (report.timedDirectly / report.totalWords) * 100;
  if (directPct < MIN_DIRECT_COVERAGE_PCT) {
    return {
      passed: false,
      reason: `Только ${directPct.toFixed(1)}% слов получили тайминг напрямую от ${report.provider} (порог ${MIN_DIRECT_COVERAGE_PCT}%) — похоже на системный сбой выравнивания, а не на отдельные неудачные слова.`,
    };
  }
  const recoveredTotal = Object.values(report.recovered).reduce((a, b) => a + b, 0);
  const recoveredPct = report.totalWords === 0 ? 0 : (recoveredTotal / report.totalWords) * 100;
  if (recoveredPct > MAX_RECOVERED_SHARE_PCT) {
    return {
      passed: false,
      reason: `${recoveredPct.toFixed(1)}% слов потребовали восстановления тайминга (порог ${MAX_RECOVERED_SHARE_PCT}%) — подсветка может заметно разъезжаться.`,
    };
  }
  return { passed: true };
}

function computeMaxGap(orderedWordTokens: Token[], timestamps: Record<string, TimedRange>): number {
  let maxGap = 0;
  let prevEnd: number | null = null;
  for (const token of orderedWordTokens) {
    const t = timestamps[token.id];
    if (!t) continue;
    if (prevEnd !== null) maxGap = Math.max(maxGap, t.startTime - prevEnd);
    prevEnd = t.endTime;
  }
  return round3(maxGap);
}

export function buildAlignmentReport(
  orderedWordTokens: Token[],
  timestampsByToken: Record<string, TimedRange>,
  recoveryLog: RecoveryEntry[],
  meta: { provider: AudioProvider; voiceId: string; modelId: string; speed?: number },
): AlignmentReport {
  const recovered = { edge: 0, interpolated: 0, stretched: 0, clamped: 0, guessed: 0 };
  const recoveredTokenIds = new Set<string>();
  for (const entry of recoveryLog) {
    recovered[entry.kind]++;
    recoveredTokenIds.add(entry.tokenId);
  }

  const timedById = new Map(
    orderedWordTokens
      .filter((t) => timestampsByToken[t.id])
      .map((t) => [t.id, { tokenId: t.id, displayText: t.text, ...timestampsByToken[t.id] }] as const),
  );
  const coverage = computeCoverage(
    orderedWordTokens.map((t) => t.id),
    timedById,
  );

  return {
    ...meta,
    totalWords: orderedWordTokens.length,
    timedDirectly: orderedWordTokens.length - recoveredTokenIds.size - coverage.unmappedTokenIds.length,
    recovered,
    coveragePct: coverage.coveragePct,
    monotonicityViolations: coverage.monotonicityViolations.length,
    maxGapSeconds: computeMaxGap(orderedWordTokens, timestampsByToken),
    generatedAt: new Date().toISOString(),
  };
}
