// Скрипт сравнения качества озвучки ElevenLabs vs OpenAI TTS на одном и том же
// отрывке урока. Не часть приложения — ключи не уходят в браузер, читаются
// только здесь, в Node, из .env.
//
// Запуск: node --env-file=.env scripts/generate-audio-sample.mjs
//
// Шаг 0 A/B-сравнения провайдеров озвучки: выбрать французский голос
// ElevenLabs на слух, прежде чем встраивать провайдера в пайплайн. OpenAI
// marin генерируется тем же текстом как точка отсчёта — это текущий прод.

import { writeFile, mkdir } from 'node:fs/promises';

const SAMPLE_TEXT =
  'Claire arrivait à la gare Saint-Lazare quand il a commencé à pleuvoir. ' +
  'Elle avait besoin de quelques minutes pour trouver un café tranquille.';

const OUT_DIR = new URL('../audio-samples/', import.meta.url);

// Premade-голоса (не library — те закрыты на бесплатном плане, 402).
// eleven_multilingual_v2 произносит французский любым из них.
const ELEVENLABS_VOICES = [
  { id: 'Xb7hH8MSUJpSbSDYk0k2', slug: 'alice', label: 'Alice — Clear, Engaging Educator' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', slug: 'george', label: 'George — Warm, Captivating Storyteller' },
  { id: 'XrExE9yKIg1WjnnlVkGX', slug: 'matilda', label: 'Matilda — Knowledgable, Professional' },
];

async function generateElevenLabsVoice({ id, slug, label }, apiKey) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${id}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: SAMPLE_TEXT,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) {
    console.error(`✗ ElevenLabs ${label}: ${res.status} ${await res.text()}`);
    return;
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(new URL(`sample-elevenlabs-${slug}.mp3`, OUT_DIR), buffer);
  console.log(`✓ audio-samples/sample-elevenlabs-${slug}.mp3 — ${label}`);
}

async function generateElevenLabs() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.log('ELEVENLABS_API_KEY не задан — пропускаю ElevenLabs.');
    return;
  }
  // Последовательно, а не Promise.all — при исчерпании кредитов понятно, какой
  // голос успел сгенерироваться, и не тратится три запроса впустую.
  for (const voice of ELEVENLABS_VOICES) {
    await generateElevenLabsVoice(voice, apiKey);
  }
}

async function generateOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('OPENAI_API_KEY не задан — пропускаю OpenAI.');
    return;
  }
  const voice = process.env.OPENAI_TTS_VOICE || 'marin';
  // gpt-4o-mini-tts (в отличие от tts-1/tts-1-hd) понимает instructions —
  // это единственный способ подсказать модели про естественный французский
  // ритм произношения, а не только выбрать голос. Текст инструкции — тот же,
  // что в lib/pipeline/generateAudio.ts, иначе сравнение нечестное.
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice,
      input: SAMPLE_TEXT,
      response_format: 'mp3',
      instructions:
        'Speak as a native French narrator reading a short story aloud, deliberately a bit slower and more clearly-articulated than normal conversational pace — the audience is language learners. Natural rhythm and intonation, warm and calm, not rushed, not robotic, not exaggeratedly slow either.',
    }),
  });
  if (!res.ok) {
    console.error('✗ OpenAI:', res.status, await res.text());
    return;
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(new URL(`sample-openai-${voice}.mp3`, OUT_DIR), buffer);
  console.log(`✓ audio-samples/sample-openai-${voice}.mp3 — текущий прод`);
}

await mkdir(OUT_DIR, { recursive: true });
await generateOpenAI();
await generateElevenLabs();
console.log('\nГотово. Сравни файлы в audio-samples/ и впиши выбранный voice_id');
console.log('в .env как ELEVENLABS_VOICE_ID.');
