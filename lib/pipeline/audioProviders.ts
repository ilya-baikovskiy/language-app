// Общий пост-процессинг шага 6 пайплайна ("озвучка + тайминги") — recovery-
// слой (timingRecovery.ts) и AlignmentReport с quality gate
// (alignmentReport.ts), одинаковый для обоих провайдеров.
//
// Намеренно НЕ единая функция "сделай всё": OpenAI-путь остаётся разбит на
// два HTTP-вызова (TTS в api/generate-audio.ts, Whisper-выравнивание в
// api/align-audio.ts) — иначе serverless-таймаут (60с) не гарантированно
// хватает на оба тяжёлых вызова подряд для урока в 200-250 слов. ElevenLabs
// же (with-timestamps) укладывает и то, и другое в один вызов к ElevenLabs,
// поэтому здесь — один вызов к нашему api/generate-audio.ts целиком.

import type { AudioProvider, Token } from '../../src/types/lesson.js';
import type { TokenSpan } from '../../src/lib/lessonText.js';
import type { LanguageConfig } from './languageConfig.js';
import { generateLessonAudioElevenLabs } from './elevenLabsAudio.js';
import { recoverTimings, type RecoveryEntry, type TimedRange } from './timingRecovery.js';
import { buildAlignmentReport, evaluateQualityGate, type AlignmentReport } from './alignmentReport.js';

export type AlignedResult = { timestampsByToken: Record<string, TimedRange>; report: AlignmentReport };

// Recovery + report, общие для обоих провайдеров — каждый провайдер отдаёт
// сырые тайминги и свой priorRecoveryLog (edge-snap у ElevenLabs, guessed у
// Whisper), а эта функция достраивает недостающее (interpolated/stretched/
// clamped) и считает итоговый отчёт.
export function finalizeAlignment(
  provider: AudioProvider,
  wordTokens: Token[],
  timestampsByToken: Record<string, TimedRange>,
  priorRecoveryLog: RecoveryEntry[],
  languageConfig: LanguageConfig,
): AlignedResult {
  const recovered = recoverTimings(wordTokens, timestampsByToken, priorRecoveryLog);
  const report = buildAlignmentReport(wordTokens, recovered.timestampsByToken, recovered.recoveryLog, {
    provider,
    voiceId: provider === 'elevenlabs' ? languageConfig.voices.elevenLabsVoiceId : languageConfig.voices.openaiVoice,
    modelId: provider === 'elevenlabs' ? languageConfig.voices.elevenLabsModelId : 'gpt-4o-mini-tts',
    speed: provider === 'elevenlabs' ? languageConfig.voices.elevenLabsSpeed : undefined,
  });
  return { timestampsByToken: recovered.timestampsByToken, report };
}

// Один вызов: ElevenLabs даёт аудио и тайминги вместе (with-timestamps), эта
// функция сразу прогоняет их через finalizeAlignment. Используется
// api/generate-audio.ts напрямую для provider=elevenlabs — align-audio.ts в
// этом случае не вызывается вовсе.
export async function generateAndAlignElevenLabs(
  text: string,
  spans: TokenSpan[],
  wordTokens: Token[],
  languageConfig: LanguageConfig,
  apiKey: string,
): Promise<AlignedResult & { audioBuffer: Buffer }> {
  const { audioBuffer, timestampsByToken, recoveryLog } = await generateLessonAudioElevenLabs(text, spans, wordTokens, languageConfig, apiKey);
  const aligned = finalizeAlignment('elevenlabs', wordTokens, timestampsByToken, recoveryLog, languageConfig);
  return { audioBuffer, ...aligned };
}

export { evaluateQualityGate };
export type { AlignmentReport };
