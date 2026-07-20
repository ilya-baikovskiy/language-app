// CLI-точка входа для входного AI-пайплайна (материал/тема → новый Lesson).
// Прогоняет все 7 стадий из плана и пишет результат для ручной проверки —
// НЕ подключает его в приложение (см. AI_PIPELINE.md / PROGRESS.md: это
// шаг валидации пайплайна локально, backend/UI — отдельная более поздняя
// итерация).
//
// Использование:
//   npx tsx --env-file=.env scripts/generate-new-lesson.ts --topic="Un pique-nique au parc" --level="A2-B1" --slug=pique-nique
//   npx tsx --env-file=.env scripts/generate-new-lesson.ts --input-file=./scripts/output/source.txt --level=B1 --words=250 --slug=my-article

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { getLanguageConfig } from './lib/pipeline/languageConfig.ts';
import { generateText, type InputSource } from './lib/pipeline/generateText.ts';
import { tokenizeParagraphs } from './lib/pipeline/tokenize.ts';
import { markPhrasesForLesson } from './lib/pipeline/markPhrases.ts';
import { generateAnnotationsForLesson } from './lib/pipeline/generateAnnotations.ts';
import { generateAudioAndTimestamps } from './lib/pipeline/generateAudio.ts';
import type { Lesson } from '../src/types/lesson.ts';

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const arg = args.find((a) => a.startsWith(`--${flag}=`));
    return arg ? arg.slice(flag.length + 3) : undefined;
  };
  return {
    topic: get('topic'),
    inputFile: get('input-file'),
    level: get('level') ?? 'A2-B1',
    words: Number(get('words') ?? '200'),
    slug: get('slug'),
  };
}

async function resolveInputSource(opts: ReturnType<typeof parseArgs>): Promise<InputSource> {
  if (opts.topic) return { kind: 'topic', prompt: opts.topic };
  if (opts.inputFile) {
    const content = await readFile(opts.inputFile, 'utf-8');
    return { kind: 'text', content };
  }
  throw new Error('Нужен --topic="..." или --input-file=путь');
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY не задан (запускай с --env-file=.env)');

  const opts = parseArgs();
  if (!opts.slug) throw new Error('Нужен --slug=имя-файла (латиницей, для выходных файлов)');

  const languageConfig = getLanguageConfig('fr');
  const sourceLanguage = 'Russian';
  const input = await resolveInputSource(opts);

  console.log(`[1/6] Вход: ${input.kind}`);

  console.log(`[2/6] Генерирую текст (уровень ${opts.level}, ~${opts.words} слов)...`);
  const generated = await generateText(input, { level: opts.level, targetWords: opts.words, sourceLanguage }, languageConfig, apiKey);
  console.log(`  ✓ «${generated.title}» — ${generated.paragraphs.length} абзацев`);

  console.log('[3/6] Токенизация...');
  const paragraphs = tokenizeParagraphs(generated.paragraphs);
  const wordCount = paragraphs.flatMap((p) => p.sentences).flatMap((s) => s.tokens).filter((t) => t.type === 'word').length;
  console.log(`  ✓ ${paragraphs.length} абзацев, ${wordCount} слов`);

  console.log('[4/6] Разметка фраз...');
  const phraseGroups = await markPhrasesForLesson(paragraphs, languageConfig, apiKey);
  console.log(`  ✓ найдено ${phraseGroups.length} фразовых групп`);

  console.log('[5/6] Генерация объяснений (это займёт несколько минут)...');
  const { paragraphs: annotatedParagraphs, annotations } = await generateAnnotationsForLesson(
    paragraphs,
    phraseGroups,
    languageConfig,
    {
      level: opts.level,
      sourceLanguage,
      concurrency: 2,
      onProgress: (done, total, failed) => process.stdout.write(`\r  ${done + failed}/${total} (ok: ${done}, fail: ${failed})`),
    },
    apiKey,
  );
  console.log(`\n  ✓ ${annotations.length} аннотаций`);

  const lessonWithoutAudio: Lesson = {
    id: opts.slug,
    language: 'French',
    sourceLanguage,
    level: opts.level,
    title: generated.title,
    translatedTitle: generated.translatedTitle,
    estimatedMinutes: generated.estimatedMinutes,
    paragraphs: annotatedParagraphs,
    annotations,
  };

  console.log('[6/6] Озвучка + таймкоды...');
  const { audioBuffer, timestampsByToken, unmatched } = await generateAudioAndTimestamps(lessonWithoutAudio, languageConfig, apiKey);
  if (unmatched.length > 0) {
    console.warn(`  ⚠ ${unmatched.length} токен(ов) не сопоставлены точно:`);
    unmatched.forEach((u) => console.warn('    -', u));
  } else {
    console.log('  ✓ все токены сопоставлены без расхождений');
  }

  const finalLesson: Lesson = {
    ...lessonWithoutAudio,
    paragraphs: lessonWithoutAudio.paragraphs.map((paragraph) => ({
      ...paragraph,
      sentences: paragraph.sentences.map((sentence) => ({
        ...sentence,
        tokens: sentence.tokens.map((token) => {
          const timing = timestampsByToken[token.id];
          return timing ? { ...token, startTime: timing.startTime, endTime: timing.endTime } : token;
        }),
      })),
    })),
  };

  const outDir = new URL('./output/', import.meta.url);
  await mkdir(outDir, { recursive: true });
  await writeFile(new URL(`${opts.slug}.json`, outDir), JSON.stringify(finalLesson, null, 2));

  const audioDir = new URL('../public/audio/', import.meta.url);
  await mkdir(audioDir, { recursive: true });
  await writeFile(new URL(`${opts.slug}.mp3`, audioDir), audioBuffer);

  console.log(`\n✓ scripts/output/${opts.slug}.json`);
  console.log(`✓ public/audio/${opts.slug}.mp3 (${(audioBuffer.length / 1024).toFixed(0)} KB)`);
  console.log('\nЭто черновик для ручной проверки — НЕ подключён в приложение автоматически.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
