import { describe, expect, it } from 'vitest';
import { buildAlignmentReport, computeCoverage, evaluateQualityGate, type AlignmentReport, type TimedToken } from '../alignmentReport.js';
import type { Token } from '../../../src/types/lesson.js';

function baseReport(overrides: Partial<AlignmentReport> = {}): AlignmentReport {
  return {
    provider: 'elevenlabs',
    voiceId: 'v1',
    modelId: 'm1',
    totalWords: 100,
    timedDirectly: 100,
    recovered: { edge: 0, interpolated: 0, stretched: 0, clamped: 0, guessed: 0 },
    coveragePct: 100,
    monotonicityViolations: 0,
    maxGapSeconds: 0,
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('evaluateQualityGate', () => {
  it('passes a report with full direct coverage', () => {
    expect(evaluateQualityGate(baseReport())).toEqual({ passed: true });
  });

  it('fails when direct coverage drops below 95%', () => {
    const result = evaluateQualityGate(baseReport({ timedDirectly: 90 }));
    expect(result.passed).toBe(false);
    if (!result.passed) expect(result.reason).toContain('90.0%');
  });

  it('passes at exactly the 95% direct-coverage threshold with low recovery', () => {
    const report = baseReport({ timedDirectly: 95, recovered: { edge: 5, interpolated: 0, stretched: 0, clamped: 0, guessed: 0 } });
    expect(evaluateQualityGate(report)).toEqual({ passed: true });
  });

  it('fails when recovered share exceeds 10% even with adequate direct coverage', () => {
    // Один и тот же токен может попасть в recoveryLog дважды (например,
    // interpolated, а потом clamped за нарушение монотонности) — timedDirectly
    // считает уникальные токены (Set), а recoveredPct — количество ЗАПИСЕЙ.
    const report = baseReport({
      timedDirectly: 95,
      recovered: { edge: 0, interpolated: 6, stretched: 0, clamped: 6, guessed: 0 },
    });
    expect(evaluateQualityGate(report).passed).toBe(false);
  });

  it('treats an empty lesson as trivially passing', () => {
    const report = baseReport({ totalWords: 0, timedDirectly: 0, coveragePct: 0 });
    expect(evaluateQualityGate(report)).toEqual({ passed: true });
  });
});

describe('buildAlignmentReport', () => {
  function word(id: string, text: string): Token {
    return { id, text, normalized: text.toLowerCase(), type: 'word', sentenceId: 's1' };
  }

  it('counts direct vs recovered tokens and computes coverage', () => {
    const tokens = [word('t0', 'un'), word('t1', 'deux'), word('t2', 'trois')];
    const timestamps = {
      t0: { startTime: 0, endTime: 0.3 },
      t1: { startTime: 0.3, endTime: 0.6 },
      t2: { startTime: 0.6, endTime: 0.9 },
    };
    const recoveryLog = [{ tokenId: 't1', kind: 'interpolated' as const }];
    const report = buildAlignmentReport(tokens, timestamps, recoveryLog, { provider: 'elevenlabs', voiceId: 'v1', modelId: 'm1' });
    expect(report.totalWords).toBe(3);
    expect(report.timedDirectly).toBe(2);
    expect(report.recovered.interpolated).toBe(1);
    expect(report.coveragePct).toBe(100);
  });

  it('reports unmapped tokens as neither direct nor recovered, and reduces coverage', () => {
    const tokens = [word('t0', 'un'), word('t1', 'deux')];
    const timestamps = { t0: { startTime: 0, endTime: 0.3 } }; // t1 никогда не получил тайминг
    const report = buildAlignmentReport(tokens, timestamps, [], { provider: 'openai', voiceId: 'marin', modelId: 'gpt-4o-mini-tts' });
    expect(report.totalWords).toBe(2);
    expect(report.timedDirectly).toBe(1);
    expect(report.coveragePct).toBeLessThan(100);
  });
});

describe('computeCoverage', () => {
  it('flags monotonicity violations when a later token starts before an earlier one', () => {
    const timed = new Map<string, TimedToken>([
      ['t0', { tokenId: 't0', displayText: 'un', startTime: 1.0, endTime: 1.5 }],
      ['t1', { tokenId: 't1', displayText: 'deux', startTime: 0.5, endTime: 1.2 }],
    ]);
    const report = computeCoverage(['t0', 't1'], timed);
    expect(report.monotonicityViolations).toContainEqual({ tokenId: 't1', prevTokenId: 't0' });
  });
});
