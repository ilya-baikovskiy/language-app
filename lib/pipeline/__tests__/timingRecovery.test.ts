import { describe, expect, it } from 'vitest';
import { recoverTimings, type TimedRange } from '../timingRecovery.js';
import type { Token } from '../../../src/types/lesson.js';

function word(id: string, text: string): Token {
  return { id, text, normalized: text.toLowerCase(), type: 'word', sentenceId: 's1' };
}

describe('recoverTimings — interpolation ("pour" gap-fill)', () => {
  it('splits the gap between neighboring timed tokens proportionally to text length for a single missing token', () => {
    const tokens = [word('t0', 'il'), word('t1', 'pour'), word('t2', 'toi')];
    const timestamps: Record<string, TimedRange> = {
      t0: { startTime: 0, endTime: 0.3 },
      t2: { startTime: 0.7, endTime: 1.0 },
    };
    const { timestampsByToken, recoveryLog } = recoverTimings(tokens, timestamps);
    expect(timestampsByToken.t1.startTime).toBe(0.3);
    expect(timestampsByToken.t1.endTime).toBe(0.7);
    expect(recoveryLog).toContainEqual({ tokenId: 't1', kind: 'interpolated' });
  });

  it('splits proportionally across multiple consecutive missing tokens', () => {
    const tokens = [word('t0', 'a'), word('t1', 'aa'), word('t2', 'aaaa'), word('t3', 'b')];
    const timestamps: Record<string, TimedRange> = {
      t0: { startTime: 0, endTime: 0.2 },
      t3: { startTime: 0.8, endTime: 1.0 },
    };
    // Пропуск [t1,t2] делит окно [0.2, 0.8] (0.6с) пропорционально длине
    // текста: t1 (len 2) / t2 (len 4) — суммарно 6, доли 2/6 и 4/6.
    const { timestampsByToken } = recoverTimings(tokens, timestamps);
    expect(timestampsByToken.t1.startTime).toBeCloseTo(0.2, 5);
    expect(timestampsByToken.t1.endTime).toBeCloseTo(0.4, 5);
    expect(timestampsByToken.t2.startTime).toBeCloseTo(0.4, 5);
    expect(timestampsByToken.t2.endTime).toBeCloseTo(0.8, 5);
  });

  it('leaves a token with no anchor on either side untimed rather than guessing', () => {
    const tokens = [word('t0', 'seul')];
    const { timestampsByToken, recoveryLog } = recoverTimings(tokens, {});
    expect(timestampsByToken.t0).toBeUndefined();
    expect(recoveryLog).toHaveLength(0);
  });
});

describe('recoverTimings — degenerate duration stretch (Whisper zero-duration class)', () => {
  it('extends a near-zero-duration token toward the next timed token, without moving the next token', () => {
    const tokens = [word('t0', 'Dehors'), word('t1', 'il')];
    const timestamps: Record<string, TimedRange> = {
      t0: { startTime: 13.46, endTime: 13.46 }, // нулевая длительность
      t1: { startTime: 13.6, endTime: 13.8 },
    };
    const { timestampsByToken, recoveryLog } = recoverTimings(tokens, timestamps);
    expect(timestampsByToken.t0.endTime).toBeGreaterThan(13.46);
    expect(timestampsByToken.t0.endTime).toBeLessThanOrEqual(13.6);
    expect(timestampsByToken.t1).toEqual({ startTime: 13.6, endTime: 13.8 });
    expect(recoveryLog).toContainEqual({ tokenId: 't0', kind: 'stretched' });
  });

  it('does not touch a token whose duration is already above the threshold', () => {
    const tokens = [word('t0', 'bonjour')];
    const timestamps: Record<string, TimedRange> = { t0: { startTime: 0, endTime: 0.5 } };
    const { timestampsByToken, recoveryLog } = recoverTimings(tokens, timestamps);
    expect(timestampsByToken.t0).toEqual({ startTime: 0, endTime: 0.5 });
    expect(recoveryLog).toHaveLength(0);
  });
});

describe('recoverTimings — monotonicity clamp', () => {
  it('clamps a token that starts before the previous token ended', () => {
    const tokens = [word('t0', 'un'), word('t1', 'deux')];
    const timestamps: Record<string, TimedRange> = {
      t0: { startTime: 0, endTime: 1.0 },
      t1: { startTime: 0.8, endTime: 1.5 }, // начинается раньше конца t0
    };
    const { timestampsByToken, recoveryLog } = recoverTimings(tokens, timestamps);
    expect(timestampsByToken.t1.startTime).toBe(1.0);
    expect(timestampsByToken.t1.endTime).toBe(1.5);
    expect(recoveryLog).toContainEqual({ tokenId: 't1', kind: 'clamped' });
  });
});

describe('recoverTimings — carries forward prior recovery entries (e.g. edge-snap from ElevenLabs)', () => {
  it('keeps entries passed in via priorRecoveryLog alongside new ones', () => {
    const tokens = [word('t0', 'mot')];
    const prior = [{ tokenId: 'other-token', kind: 'edge' as const }];
    const { recoveryLog } = recoverTimings(tokens, { t0: { startTime: 0, endTime: 0.5 } }, prior);
    expect(recoveryLog).toContainEqual({ tokenId: 'other-token', kind: 'edge' });
  });
});
