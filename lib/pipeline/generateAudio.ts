// OpenAI-провайдер шага 6 пайплайна: озвучка (gpt-4o-mini-tts) + word-level
// таймкоды через Whisper. Whisper *распознаёт* готовое аудио заново и
// сопоставляется с нашими токенами эвристикой (alignTokensToWhisper) — в
// отличие от ElevenLabs-пути (elevenLabsAudio.ts), где тайминги приходят как
// побочный продукт самого синтеза. Оба провайдера отдают одинаковую форму
// результата через lib/pipeline/audioProviders.ts.

import type { LanguageConfig } from './languageConfig.js';
import { buildLessonText, findTokenAtOffset, type TokenSpan } from '../../src/lib/lessonText.js';
import type { Lesson, Token } from '../../src/types/lesson.js';
import type { RecoveryEntry, TimedRange } from './timingRecovery.js';

type WhisperWord = { word: string; start: number; end: number };

export async function generateSpeech(text: string, languageConfig: LanguageConfig, apiKey: string): Promise<Buffer> {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: languageConfig.voices.openaiVoice,
      input: text,
      response_format: 'mp3',
      instructions: `Speak as a native ${languageConfig.promptLanguageName} narrator reading a short story aloud, deliberately a bit slower and more clearly-articulated than normal conversational pace — the audience is language learners. Natural rhythm and intonation, warm and calm, not rushed, not robotic, not exaggeratedly slow either.`,
    }),
  });
  if (!res.ok) throw new Error(`TTS error ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

async function transcribeWithTimestamps(
  audioBuffer: Buffer,
  languageConfig: LanguageConfig,
  apiKey: string,
): Promise<WhisperWord[]> {
  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'lesson.mp3');
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('language', languageConfig.whisperLanguageCode);
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Whisper error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { words: WhisperWord[] };
  return json.words;
}

function normalize(word: string): string {
  return word
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^\p{L}\p{N}'-]/gu, '');
}

function normalizeLoose(word: string): string {
  return normalize(word).replace(/['-]/g, '');
}

function collectWordTokens(lesson: Lesson): Token[] {
  const tokens: Token[] = [];
  for (const p of lesson.paragraphs) {
    for (const s of p.sentences) {
      for (const t of s.tokens) {
        if (t.type === 'word') tokens.push(t);
      }
    }
  }
  return tokens;
}

// recoveryLog собирает только 'guessed' — случаи, когда точное текстовое
// совпадение не нашлось и Whisper-слово присвоено токену как best-effort
// (последняя ветка ниже). Успешные merge-recovery (элизии/дефисы в обе
// стороны) — это НЕ recovery в смысле AlignmentReport: там текст сошёлся
// точно, просто с других длин по обе стороны, а не эвристическая догадка.
function alignTokensToWhisper(tokens: Token[], whisperWords: WhisperWord[]): { result: Record<string, TimedRange>; recoveryLog: RecoveryEntry[] } {
  const result: Record<string, TimedRange> = {};
  const recoveryLog: RecoveryEntry[] = [];
  let wi = 0;

  for (let ti = 0; ti < tokens.length; ti++) {
    const token = tokens[ti];
    const target = normalize(token.text);

    if (wi >= whisperWords.length) {
      continue;
    }
    const w = whisperWords[wi];
    const wNorm = normalize(w.word);

    if (wNorm === target) {
      result[token.id] = { startTime: w.start, endTime: w.end };
      wi++;
      continue;
    }

    const targetLoose = normalizeLoose(token.text);

    {
      let merged = '';
      let j = wi;
      let endTime = w.end;
      let matched = false;
      while (j < whisperWords.length && j < wi + 4) {
        merged += normalizeLoose(whisperWords[j].word);
        endTime = whisperWords[j].end;
        j++;
        if (merged === targetLoose) {
          matched = true;
          break;
        }
        if (merged.length > targetLoose.length) break;
      }
      if (matched) {
        result[token.id] = { startTime: w.start, endTime };
        wi = j;
        continue;
      }
    }

    {
      let merged = targetLoose;
      let k = ti;
      let matched = merged === wNorm.replace(/['-]/g, '');
      while (!matched && k + 1 < tokens.length && merged.length < wNorm.length) {
        k++;
        merged += normalizeLoose(tokens[k].text);
        matched = merged === wNorm.replace(/['-]/g, '');
      }
      if (matched && k > ti) {
        const totalLen = merged.length;
        let cursor = w.start;
        for (let x = ti; x <= k; x++) {
          const share = normalizeLoose(tokens[x].text).length / totalLen;
          const dur = (w.end - w.start) * share;
          result[tokens[x].id] = { startTime: cursor, endTime: cursor + dur };
          cursor += dur;
        }
        ti = k;
        wi++;
        continue;
      }
    }

    // Ни точное, ни merge-совпадение не нашлись — присваиваем Whisper-слово
    // как есть, чтобы не потерять синхронизацию со следующими токенами, но
    // помечаем как 'guessed': AlignmentReport и quality gate должны это видеть.
    result[token.id] = { startTime: w.start, endTime: w.end };
    recoveryLog.push({ tokenId: token.id, kind: 'guessed' });
    wi++;
  }

  return { result, recoveryLog };
}

// Раздельно от TTS — так каждый HTTP-вызов (api/generate-audio.ts делает TTS,
// api/align-audio.ts делает это) короче и безопаснее по таймауту serverless-функции.
export async function transcribeAndAlign(
  audioBuffer: Buffer,
  wordTokens: Token[],
  languageConfig: LanguageConfig,
  apiKey: string,
): Promise<{ timestampsByToken: Record<string, TimedRange>; recoveryLog: RecoveryEntry[] }> {
  const whisperWords = await transcribeWithTimestamps(audioBuffer, languageConfig, apiKey);
  const { result, recoveryLog } = alignTokensToWhisper(wordTokens, whisperWords);

  const rounded: Record<string, TimedRange> = {};
  for (const [id, v] of Object.entries(result)) {
    rounded[id] = { startTime: Math.round(v.startTime * 1000) / 1000, endTime: Math.round(v.endTime * 1000) / 1000 };
  }

  return { timestampsByToken: rounded, recoveryLog };
}

// Удобная обёртка для CLI (весь урок целиком, локально, без разделения на два HTTP-вызова).
export async function generateAudioAndTimestamps(
  lesson: Lesson,
  languageConfig: LanguageConfig,
  apiKey: string,
): Promise<{ audioBuffer: Buffer; timestampsByToken: Record<string, TimedRange>; recoveryLog: RecoveryEntry[] }> {
  const { text } = buildLessonText(lesson);
  const audioBuffer = await generateSpeech(text, languageConfig, apiKey);
  const wordTokens = collectWordTokens(lesson);
  const { timestampsByToken, recoveryLog } = await transcribeAndAlign(audioBuffer, wordTokens, languageConfig, apiKey);
  return { audioBuffer, timestampsByToken, recoveryLog };
}

export { collectWordTokens };

// Реэкспорт — используется CLI для сборки текста урока при необходимости.
export type { TokenSpan };
export { findTokenAtOffset };
