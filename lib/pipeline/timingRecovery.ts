// Провайдеро-независимый recovery-слой поверх сырых таймингов выравнивания.
// И Whisper-путь (generateAudio.ts), и ElevenLabs-путь (elevenLabsAudio.ts)
// иногда не могут уверенно определить тайминг части слов — по разным причинам
// (Whisper путает границы слов, ElevenLabs даёт невалидные тайминги символов на
// лиэзонах), но оба класса отказов нельзя оставлять как "слово без подсветки":
// пользователь видит это как баг, а не как техническую деталь провайдера.
//
// Каждая стадия работает над уже собранным timestampsByToken (после того как
// сам провайдер сделал что мог) и помечает, что именно исправила — это идёт в
// alignmentReport.ts как сигнал качества, а не скрывается молча.

import type { Token } from '../../src/types/lesson.js';

export type TimedRange = { startTime: number; endTime: number };
// edge — mapCharactersToTokens расширил границу токена до соседнего валидного
//   символа (ElevenLabs); interpolated — токен вообще не был размечен, окно
//   поделено между соседями; stretched — нулевая/микро-длительность растянута
//   в паузу; clamped — нарушение монотонности; guessed — Whisper не нашёл
//   точного текстового совпадения и сопоставил по эвристике (см. generateAudio.ts).
export type RecoveryKind = 'edge' | 'interpolated' | 'stretched' | 'clamped' | 'guessed';
export type RecoveryEntry = { tokenId: string; kind: RecoveryKind };

const MIN_DURATION_SECONDS = 0.03;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Полностью пропущенные токены («pour»): делим окно между ближайшими
// таймированными соседями пропорционально длине текста — тот же приём, что
// уже применялся для элизий в Whisper-пути (alignTokensToWhisper), обобщённый
// на любой провайдер. Если анкера нет ни с одной стороны (весь урок не
// размечен) — токен остаётся без таймкода, интерполировать не от чего.
function interpolateMissing(orderedWordTokens: Token[], timestamps: Record<string, TimedRange>, recoveryLog: RecoveryEntry[]): void {
  let i = 0;
  while (i < orderedWordTokens.length) {
    if (timestamps[orderedWordTokens[i].id]) {
      i++;
      continue;
    }
    let j = i;
    while (j < orderedWordTokens.length && !timestamps[orderedWordTokens[j].id]) j++;

    const prevEnd = i > 0 ? timestamps[orderedWordTokens[i - 1].id]?.endTime : undefined;
    const nextStart = j < orderedWordTokens.length ? timestamps[orderedWordTokens[j].id]?.startTime : undefined;

    if (prevEnd !== undefined || nextStart !== undefined) {
      const start = prevEnd ?? nextStart!;
      const end = nextStart ?? prevEnd!;
      const run = orderedWordTokens.slice(i, j);
      const totalLen = run.reduce((sum, t) => sum + t.text.length, 0) || run.length;
      let cursor = start;
      const span = Math.max(0, end - start);
      for (const token of run) {
        const share = token.text.length / totalLen;
        const duration = span * share;
        timestamps[token.id] = { startTime: round3(cursor), endTime: round3(cursor + duration) };
        cursor += duration;
        recoveryLog.push({ tokenId: token.id, kind: 'interpolated' });
      }
    }
    i = j;
  }
}

// Нулевая/микро-длительность (характерно для Whisper на коротких служебных
// словах): растягиваем endTime вперёд, в паузу до следующего таймированного
// токена — не трогая чужой startTime, чтобы не сдвинуть соседа.
function stretchDegenerate(orderedWordTokens: Token[], timestamps: Record<string, TimedRange>, recoveryLog: RecoveryEntry[]): void {
  for (let i = 0; i < orderedWordTokens.length; i++) {
    const current = timestamps[orderedWordTokens[i].id];
    if (!current) continue;
    const duration = current.endTime - current.startTime;
    if (duration >= MIN_DURATION_SECONDS) continue;

    const next = orderedWordTokens.slice(i + 1).find((t) => timestamps[t.id]);
    const ceiling = next ? timestamps[next.id].startTime : current.startTime + MIN_DURATION_SECONDS;
    const newEnd = Math.max(current.endTime, Math.min(ceiling, current.startTime + MIN_DURATION_SECONDS));
    if (newEnd !== current.endTime) {
      timestamps[orderedWordTokens[i].id] = { startTime: current.startTime, endTime: round3(newEnd) };
      recoveryLog.push({ tokenId: orderedWordTokens[i].id, kind: 'stretched' });
    }
  }
}

// Монотонность/перекрытия: клампим начало текущего токена не раньше конца
// предыдущего — редкий стык провайдерских артефактов, но ломает подсветку
// сильнее короткого окна (она "прыгает назад").
function clampMonotonic(orderedWordTokens: Token[], timestamps: Record<string, TimedRange>, recoveryLog: RecoveryEntry[]): void {
  let prevEnd: number | null = null;
  for (const token of orderedWordTokens) {
    const current = timestamps[token.id];
    if (!current) continue;
    if (prevEnd !== null && current.startTime < prevEnd) {
      const newEnd = Math.max(current.endTime, prevEnd);
      timestamps[token.id] = { startTime: prevEnd, endTime: round3(newEnd) };
      recoveryLog.push({ tokenId: token.id, kind: 'clamped' });
      prevEnd = newEnd;
      continue;
    }
    prevEnd = current.endTime;
  }
}

export function recoverTimings(
  orderedWordTokens: Token[],
  timestampsByToken: Record<string, TimedRange>,
  priorRecoveryLog: RecoveryEntry[] = [],
): { timestampsByToken: Record<string, TimedRange>; recoveryLog: RecoveryEntry[] } {
  const result = { ...timestampsByToken };
  const recoveryLog = [...priorRecoveryLog];
  interpolateMissing(orderedWordTokens, result, recoveryLog);
  stretchDegenerate(orderedWordTokens, result, recoveryLog);
  clampMonotonic(orderedWordTokens, result, recoveryLog);
  return { timestampsByToken: result, recoveryLog };
}
