// Одноразовый скрипт сравнения качества озвучки ElevenLabs vs OpenAI TTS
// на одном и том же отрывке урока. Не часть приложения — ключи не уходят
// в браузер, читаются только здесь, в Node, из .env.
//
// Запуск: node --env-file=.env scripts/generate-audio-sample.mjs

import { writeFile, mkdir } from 'node:fs/promises';

const SAMPLE_TEXT =
  'Claire arrivait à la gare Saint-Lazare quand il a commencé à pleuvoir. ' +
  'Elle avait besoin de quelques minutes pour trouver un café tranquille.';

const OUT_DIR = new URL('../audio-samples/', import.meta.url);

async function generateElevenLabs() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.log('ELEVENLABS_API_KEY не задан — пропускаю ElevenLabs.');
    return;
  }
  const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
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
    console.error('ElevenLabs error:', res.status, await res.text());
    return;
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(new URL('sample-elevenlabs.mp3', OUT_DIR), buffer);
  console.log('✓ audio-samples/sample-elevenlabs.mp3');
}

async function generateOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('OPENAI_API_KEY не задан — пропускаю OpenAI.');
    return;
  }
  const voice = process.env.OPENAI_TTS_VOICE || 'alloy';
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1-hd',
      voice,
      input: SAMPLE_TEXT,
      response_format: 'mp3',
    }),
  });
  if (!res.ok) {
    console.error('OpenAI error:', res.status, await res.text());
    return;
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(new URL('sample-openai.mp3', OUT_DIR), buffer);
  console.log('✓ audio-samples/sample-openai.mp3');
}

await mkdir(OUT_DIR, { recursive: true });
await Promise.all([generateElevenLabs(), generateOpenAI()]);
console.log('Готово. Сравни файлы в audio-samples/.');
