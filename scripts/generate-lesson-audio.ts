// Генерирует озвучку всего урока (gpt-4o-mini-tts, голос marin) и
// прогоняет её через Whisper за word-level таймкодами, сопоставляя каждое
// слово с нашим токеном. Результат:
//   public/audio/lesson-fr.mp3        — статический аудиофайл (часть приложения)
//   src/data/lessonTimestamps.json    — { tokenId: { startTime, endTime } }
//
// Запуск: npx tsx --env-file=.env scripts/generate-lesson-audio.ts
//
// Не рантайм-код: ключ читается только здесь, в Node, один раз при
// подготовке урока — приложение в браузере ничего не знает про OpenAI.

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { sampleLesson } from '../src/data/sampleLesson.js';
import { buildLessonText } from '../src/lib/lessonText.js';
import type { Lesson, Token } from '../src/types/lesson.js';

const AUDIO_OUT = new URL('../public/audio/lesson-fr.mp3', import.meta.url);
const TIMESTAMPS_OUT = new URL('../src/data/lessonTimestamps.json', import.meta.url);
const WHISPER_CACHE = new URL('./.whisper-cache.json', import.meta.url);
// --fresh — заново дёргать TTS и Whisper вместо кэша (платные вызовы).
const FORCE_FRESH = process.argv.includes('--fresh');

type WhisperWord = { word: string; start: number; end: number };

async function generateSpeech(text: string, apiKey: string): Promise<Buffer> {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: process.env.OPENAI_TTS_VOICE || 'marin',
      input: text,
      response_format: 'mp3',
      // Не использовать числовой speed — это постобработка/тайм-стретч поверх
      // обычного темпа и звучит неестественно (артефакты). Медленный темп
      // просим у самой модели через instructions, чтобы это была настоящая
      // медленная речь, а не растянутая обычная.
      instructions:
        'Speak as a native French narrator reading a short story aloud, deliberately a bit slower and more clearly-articulated than normal conversational pace — the audience is language learners. Natural French rhythm and intonation, warm and calm, not rushed, not robotic, not exaggeratedly slow either.',
    }),
  });
  if (!res.ok) throw new Error(`TTS error ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

async function transcribeWithTimestamps(audioBuffer: Buffer, apiKey: string): Promise<WhisperWord[]> {
  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'lesson.mp3');
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('language', 'fr');
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

// Строгая форма может не совпасть из-за апострофа/дефиса — Whisper иногда
// режет элизии ("s'est" → "s" + "est") или дефисные имена ("Saint-Lazare" →
// "saint" + "lazare") на отдельные слова. Для восстановления сравниваем
// уже без апострофов/дефисов вовсе.
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

    // Whisper мог разбить наш токен (элизия, дефис) на несколько слов —
    // пробуем склеить вперёд до 4 слов Whisper и сравнить в "мягкой" форме.
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

    // Обратный случай — Whisper склеил несколько наших токенов в одно слово.
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
    // best-effort, чтобы не потерять синхронизацию со следующими словами
    result[token.id] = { startTime: w.start, endTime: w.end };
    wi++;
  }

  return { result, unmatched };
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY не задан (запускай с --env-file=.env)');

  const { text } = buildLessonText(sampleLesson);
  console.log(`Текст урока: ${text.length} символов.`);

  let whisperWords: WhisperWord[];

  if (!FORCE_FRESH && existsSync(WHISPER_CACHE)) {
    console.log('Использую кэш Whisper (.whisper-cache.json) — audio уже сгенерирован ранее.');
    whisperWords = JSON.parse(await readFile(WHISPER_CACHE, 'utf-8'));
  } else {
    console.log('Генерирую озвучку (gpt-4o-mini-tts, marin)...');
    const audio = await generateSpeech(text, apiKey);
    await mkdir(new URL('.', AUDIO_OUT), { recursive: true });
    await writeFile(AUDIO_OUT, audio);
    console.log(`✓ public/audio/lesson-fr.mp3 (${(audio.length / 1024).toFixed(0)} KB)`);

    console.log('Прогоняю через Whisper за word-level таймкодами...');
    whisperWords = await transcribeWithTimestamps(audio, apiKey);
    await writeFile(WHISPER_CACHE, JSON.stringify(whisperWords, null, 2));
  }
  console.log(`Whisper вернул ${whisperWords.length} слов.`);

  const wordTokens = collectWordTokens(sampleLesson);
  console.log(`В уроке ${wordTokens.length} словесных токенов.`);

  const { result, unmatched } = alignTokensToWhisper(wordTokens, whisperWords);
  if (unmatched.length > 0) {
    console.warn(`⚠ Не удалось точно сопоставить ${unmatched.length} токен(ов):`);
    unmatched.forEach((u) => console.warn('  -', u));
  } else {
    console.log('✓ Все токены сопоставлены без расхождений.');
  }

  const rounded = Object.fromEntries(
    Object.entries(result).map(([id, v]) => [
      id,
      { startTime: Math.round(v.startTime * 1000) / 1000, endTime: Math.round(v.endTime * 1000) / 1000 },
    ]),
  );
  await writeFile(TIMESTAMPS_OUT, JSON.stringify(rounded, null, 2));
  console.log('✓ src/data/lessonTimestamps.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
