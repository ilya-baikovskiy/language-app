// Шаг 6 пайплайна — обобщение scripts/generate-lesson-audio.ts: озвучка +
// word-level таймкоды через Whisper, с тем же merge-recovery для элизий/
// дефисов (общий алгоритм, специфики под конкретный текст в нём нет).

import type { LanguageConfig } from './languageConfig.js';
import { buildLessonText, findTokenAtOffset, type TokenSpan } from '../../src/lib/lessonText.js';
import type { Lesson, Token } from '../../src/types/lesson.js';

type WhisperWord = { word: string; start: number; end: number };

export async function generateSpeech(text: string, languageConfig: LanguageConfig, apiKey: string): Promise<Buffer> {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: languageConfig.ttsVoice,
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

function alignTokensToWhisper(tokens: Token[], whisperWords: WhisperWord[]) {
  const result: Record<string, { startTime: number; endTime: number }> = {};
  const unmatched: string[] = [];
  let wi = 0;

  for (let ti = 0; ti < tokens.length; ti++) {
    const token = tokens[ti];
    const target = normalize(token.text);

    if (wi >= whisperWords.length) {
      unmatched.push(`${token.text} (закончились слова Whisper)`);
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

    unmatched.push(`"${token.text}" (ожидали "${target}", Whisper дал "${w.word}")`);
    result[token.id] = { startTime: w.start, endTime: w.end };
    wi++;
  }

  return { result, unmatched };
}

// Раздельно от TTS — так каждый HTTP-вызов (api/generate-audio.ts делает TTS,
// api/align-audio.ts делает это) короче и безопаснее по таймауту serverless-функции.
export async function transcribeAndAlign(
  audioBuffer: Buffer,
  wordTokens: Token[],
  languageConfig: LanguageConfig,
  apiKey: string,
): Promise<{ timestampsByToken: Record<string, { startTime: number; endTime: number }>; unmatched: string[] }> {
  const whisperWords = await transcribeWithTimestamps(audioBuffer, languageConfig, apiKey);
  const { result, unmatched } = alignTokensToWhisper(wordTokens, whisperWords);

  const rounded: Record<string, { startTime: number; endTime: number }> = {};
  for (const [id, v] of Object.entries(result)) {
    rounded[id] = { startTime: Math.round(v.startTime * 1000) / 1000, endTime: Math.round(v.endTime * 1000) / 1000 };
  }

  return { timestampsByToken: rounded, unmatched };
}

// Удобная обёртка для CLI (весь урок целиком, локально, без разделения на два HTTP-вызова).
export async function generateAudioAndTimestamps(
  lesson: Lesson,
  languageConfig: LanguageConfig,
  apiKey: string,
): Promise<{
  audioBuffer: Buffer;
  timestampsByToken: Record<string, { startTime: number; endTime: number }>;
  unmatched: string[];
}> {
  const { text } = buildLessonText(lesson);
  const audioBuffer = await generateSpeech(text, languageConfig, apiKey);
  const wordTokens = collectWordTokens(lesson);
  const { timestampsByToken, unmatched } = await transcribeAndAlign(audioBuffer, wordTokens, languageConfig, apiKey);
  return { audioBuffer, timestampsByToken, unmatched };
}

export { collectWordTokens };

// Реэкспорт — используется CLI для сборки текста урока при необходимости.
export type { TokenSpan };
export { findTokenAtOffset };
