// Крошечный статический сервер только для eval-preview — не Vite, не трогает
// прод. Отдаёт фиксированный набор файлов (никакого произвольного directory
// listing/traversal): саму preview-страницу, сгенерированные eval-JSON и
// оригинальный public/audio/lesson-fr.mp3 (тот же файл, что и в приложении).

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PREVIEW_DIR = path.dirname(fileURLToPath(import.meta.url));
const EVAL_DIR = path.resolve(PREVIEW_DIR, '..');
const MP3_PATH = path.resolve(EVAL_DIR, '../../public/audio/lesson-fr.mp3');
const PORT = 4321;

const ROUTES = {
  '/': { file: path.join(PREVIEW_DIR, 'index.html'), type: 'text/html; charset=utf-8' },
  '/app.js': { file: path.join(PREVIEW_DIR, 'app.js'), type: 'text/javascript; charset=utf-8' },
  '/lesson-snapshot.json': { file: path.join(EVAL_DIR, 'lesson-snapshot.json'), type: 'application/json; charset=utf-8' },
  '/whisper-timestamps.json': { file: path.join(EVAL_DIR, 'whisper-timestamps.json'), type: 'application/json; charset=utf-8' },
  '/elevenlabs-timestamps.json': { file: path.join(EVAL_DIR, 'elevenlabs-timestamps.json'), type: 'application/json; charset=utf-8' },
  '/comparison.json': { file: path.join(EVAL_DIR, 'comparison.json'), type: 'application/json; charset=utf-8' },
  '/audio/lesson-fr.mp3': { file: MP3_PATH, type: 'audio/mpeg' },
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const route = ROUTES[url.pathname];
  if (!route) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found. Похоже, сначала нужно запустить npm run eval:alignment.');
    return;
  }
  try {
    const data = await readFile(route.file);
    res.writeHead(200, { 'Content-Type': route.type });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Файл ещё не сгенерирован: ${path.basename(route.file)}. Запусти сначала npm run eval:alignment.`);
  }
});

server.listen(PORT, () => {
  // Требование задачи: в терминале — только локальный URL, ничего больше.
  console.log(`http://localhost:${PORT}`);
});
