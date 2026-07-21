// CLI-оркестратор эксперимента: npm run eval:alignment [-- --fresh]
//
// Сравнивает текущий production-baseline (OpenAI TTS → Whisper → custom
// mapping, src/data/lessonTimestamps.json) с ElevenLabs Forced Alignment на
// ТОМ ЖЕ самом public/audio/lesson-fr.mp3 — без новой генерации озвучки.
// Ничего в src/, api/, production-данных не меняет.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sampleLesson } from '../../../src/data/sampleLesson.js';
import { buildLessonText, orderedWordTokenIds } from '../../../src/lib/lessonText.js';
import { collectWordTokens } from '../../../lib/pipeline/generateAudio.js';
import type { Token } from '../../../src/types/lesson.js';
import { getForcedAlignment } from './elevenLabsClient.js';
import { mapCharactersToTokens, type UnmappedToken } from './mapCharactersToTokens.js';
import { computeCoverage, computePairedDiffs, percentile, round3, type CoverageReport, type PairedDiff, type TimedToken } from './metrics.js';

const EVAL_DIR = path.resolve(import.meta.dirname, '..');
const MP3_PATH = path.resolve(EVAL_DIR, '../../public/audio/lesson-fr.mp3');
const WHISPER_BASELINE_PATH = path.resolve(EVAL_DIR, '../../src/data/lessonTimestamps.json');

const force = process.argv.includes('--fresh');

type EvalComparison = {
  generatedAt: string;
  lessonId: string;
  audioFile: string;
  elevenLabsOverallLoss: number;
  responseTextMatches: boolean;
  whisper: { coverage: CoverageReport };
  elevenlabs: { coverage: CoverageReport; unmapped: UnmappedToken[] };
  diffs: {
    count: number;
    startTime: { p50: number; p95: number; max: number };
    endTime: { p50: number; p95: number; max: number };
    max: { p50: number; p95: number; max: number };
    top15: PairedDiff[];
    flaggedForManualCheck: PairedDiff[];
    all: PairedDiff[];
  };
};

function buildTokensById(): Map<string, Token> {
  const map = new Map<string, Token>();
  for (const p of sampleLesson.paragraphs) {
    for (const s of p.sentences) {
      for (const t of s.tokens) map.set(t.id, t);
    }
  }
  return map;
}

function sentenceInitialTokenIds(): Set<string> {
  const ids = new Set<string>();
  for (const p of sampleLesson.paragraphs) {
    for (const s of p.sentences) {
      const firstWord = s.tokens.find((t) => t.type === 'word');
      if (firstWord) ids.add(firstWord.id);
    }
  }
  return ids;
}

async function loadWhisperBaseline(tokensById: Map<string, Token>): Promise<Map<string, TimedToken>> {
  const raw = JSON.parse(await readFile(WHISPER_BASELINE_PATH, 'utf-8')) as Record<
    string,
    { startTime: number; endTime: number }
  >;
  const map = new Map<string, TimedToken>();
  for (const [tokenId, timing] of Object.entries(raw)) {
    const token = tokensById.get(tokenId);
    if (!token || token.type !== 'word') continue;
    map.set(tokenId, { tokenId, displayText: token.text, startTime: timing.startTime, endTime: timing.endTime });
  }
  return map;
}

function toTimedMap(mapped: TimedToken[]): Map<string, TimedToken> {
  return new Map(mapped.map((m) => [m.tokenId, m]));
}

function renderReport(comparison: EvalComparison): string {
  const { whisper, elevenlabs, diffs } = comparison;
  const lines: string[] = [];
  lines.push('# Audio alignment eval: Whisper baseline vs ElevenLabs Forced Alignment');
  lines.push('');
  lines.push(`Сгенерировано: ${comparison.generatedAt}`);
  lines.push('');
  lines.push('Технический эксперимент на одном и том же `public/audio/lesson-fr.mp3` — новая озвучка не генерировалась.');
  lines.push('');
  lines.push('## Покрытие');
  lines.push('');
  lines.push('| | Whisper (baseline) | ElevenLabs Forced Alignment |');
  lines.push('|---|---|---|');
  lines.push(`| word-токенов всего | ${whisper.coverage.totalWordTokens} | ${elevenlabs.coverage.totalWordTokens} |`);
  lines.push(`| покрыто | ${whisper.coverage.coveredCount} (${whisper.coverage.coveragePct}%) | ${elevenlabs.coverage.coveredCount} (${elevenlabs.coverage.coveragePct}%) |`);
  lines.push(`| unmapped | ${whisper.coverage.unmappedTokenIds.length} | ${elevenlabs.coverage.unmappedTokenIds.length} |`);
  lines.push(`| monotonicity violations | ${whisper.coverage.monotonicityViolations.length} | ${elevenlabs.coverage.monotonicityViolations.length} |`);
  lines.push(`| overlap violations | ${whisper.coverage.overlapViolations.length} | ${elevenlabs.coverage.overlapViolations.length} |`);
  lines.push(`| короткая/нулевая длительность | ${whisper.coverage.shortOrZeroDurationTokens.length} | ${elevenlabs.coverage.shortOrZeroDurationTokens.length} |`);
  lines.push(`| первое слово / конец последнего | ${whisper.coverage.firstWordStart}s / ${whisper.coverage.lastWordEnd}s | ${elevenlabs.coverage.firstWordStart}s / ${elevenlabs.coverage.lastWordEnd}s |`);
  lines.push('');
  if (!comparison.responseTextMatches) {
    lines.push('## ⚠️ Текст ответа ElevenLabs не совпал с отправленным');
    lines.push('');
    lines.push('Позиционное сопоставление не выполнялось — все токены ElevenLabs помечены unmapped. Смотри детали в comparison.json.');
    lines.push('');
  }
  lines.push(`## Разница (только на ${diffs.count} токенах, покрытых обоими вариантами)`);
  lines.push('');
  lines.push('| | start diff | end diff | max diff |');
  lines.push('|---|---|---|---|');
  lines.push(`| p50 | ${diffs.startTime.p50}s | ${diffs.endTime.p50}s | ${diffs.max.p50}s |`);
  lines.push(`| p95 | ${diffs.startTime.p95}s | ${diffs.endTime.p95}s | ${diffs.max.p95}s |`);
  lines.push(`| max | ${diffs.startTime.max}s | ${diffs.endTime.max}s | ${diffs.max.max}s |`);
  lines.push('');
  lines.push(
    'ElevenLabs overall loss (не путать с точностью для пользователя, только техническая уверенность модели в собственном совмещении): ' +
      comparison.elevenLabsOverallLoss,
  );
  lines.push('');
  lines.push('## 15 токенов с наибольшей разницей');
  lines.push('');
  lines.push('| token | text | whisper start–end | elevenlabs start–end | max diff |');
  lines.push('|---|---|---|---|---|');
  for (const d of diffs.top15) {
    lines.push(`| ${d.tokenId} | ${d.displayText} | ${d.whisperStart}–${d.whisperEnd} | ${d.elevenStart}–${d.elevenEnd} | ${d.maxDiff}s |`);
  }
  lines.push('');
  lines.push('## Токены для ручной проверки (апострофы/дефисы/цифры/имена/короткие служебные слова)');
  lines.push('');
  lines.push('| token | text | признаки | max diff |');
  lines.push('|---|---|---|---|');
  for (const d of diffs.flaggedForManualCheck) {
    const flags = Object.entries(d.flags)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(', ');
    lines.push(`| ${d.tokenId} | ${d.displayText} | ${flags} | ${d.maxDiff}s |`);
  }
  lines.push('');
  lines.push('## Unmapped (ElevenLabs)');
  lines.push('');
  if (elevenlabs.unmapped.length === 0) {
    lines.push('Нет.');
  } else {
    lines.push('| token | text | причина |');
    lines.push('|---|---|---|');
    for (const u of elevenlabs.unmapped) lines.push(`| ${u.tokenId} | ${u.displayText} | ${u.reason} |`);
  }
  lines.push('');
  lines.push('## Что нельзя определить автоматически');
  lines.push('');
  lines.push(
    '- Метрики выше (coverage, diff в секундах, ElevenLabs loss) показывают ТЕХНИЧЕСКОЕ совмещение с сигналом, а не то, ' +
      'звучит ли подсветка естественно для слушателя. Автоматические числа — не ground truth.',
  );
  lines.push(
    '- Только человек может услышать: подсветка чуть опережает/отстаёт от произношения на слух, ' +
      'слово "проглочено" при слитной речи, естественность пауз между словами.',
  );
  lines.push('- Обязательна ручная проверка через preview (`npm run eval:alignment:preview`) на 1× и 0.8× — см. README.md, раздел «Ручная проверка».');
  lines.push('- Этот эксперимент — один урок, один язык. Обобщать на весь пайплайн/другие языки нельзя без расширенного теста.');
  lines.push('');

  return lines.join('\n');
}

async function main() {
  console.log('== Audio alignment eval: Whisper baseline vs ElevenLabs Forced Alignment ==');

  const { text: lessonText, spans } = buildLessonText(sampleLesson);
  const tokensById = buildTokensById();
  const wordTokenIds = orderedWordTokenIds(sampleLesson);
  const wordTokens = collectWordTokens(sampleLesson);
  console.log(`Текст урока: ${lessonText.length} символов, ${wordTokens.length} word-токенов.`);

  let audioBuffer: Buffer;
  try {
    audioBuffer = await readFile(MP3_PATH);
  } catch {
    console.error(`Не найден аудиофайл: ${MP3_PATH}`);
    process.exitCode = 1;
    return;
  }

  let elevenRaw: Awaited<ReturnType<typeof getForcedAlignment>>['data'];
  let fromCache: boolean;
  try {
    const result = await getForcedAlignment(audioBuffer, lessonText, { force });
    elevenRaw = result.data;
    fromCache = result.fromCache;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }
  console.log(
    fromCache
      ? 'ElevenLabs: использован локальный кэш (платный запрос не выполнялся).'
      : 'ElevenLabs: выполнен один платный запрос, ответ закэширован.',
  );
  console.log(`ElevenLabs overall loss: ${elevenRaw.loss}`);

  const { mapped: elevenMapped, unmapped: elevenUnmapped, responseTextMatches } = mapCharactersToTokens(
    elevenRaw.characters,
    lessonText,
    spans,
    tokensById,
  );
  if (!responseTextMatches) {
    console.error(
      'ВНИМАНИЕ: текст ответа ElevenLabs не совпал посимвольно с отправленным текстом урока. ' +
        'Позиционное сопоставление не выполнено ни для одного токена (см. report.md).',
    );
  }

  const whisperTimed = await loadWhisperBaseline(tokensById);
  const elevenTimed = toTimedMap(elevenMapped);

  const whisperCoverage = computeCoverage(wordTokenIds, whisperTimed);
  const elevenCoverage = computeCoverage(wordTokenIds, elevenTimed);

  const pairedDiffs = computePairedDiffs(wordTokenIds, whisperTimed, elevenTimed, tokensById, sentenceInitialTokenIds());
  const startDiffsSorted = pairedDiffs.map((d) => d.startDiff).sort((a, b) => a - b);
  const endDiffsSorted = pairedDiffs.map((d) => d.endDiff).sort((a, b) => a - b);
  const maxDiffsSorted = pairedDiffs.map((d) => d.maxDiff).sort((a, b) => a - b);

  const top15 = [...pairedDiffs].sort((a, b) => b.maxDiff - a.maxDiff).slice(0, 15);
  const flaggedForManualCheck = pairedDiffs.filter(
    (d) => d.flags.hasApostrophe || d.flags.hasHyphen || d.flags.hasDigit || d.flags.isShortFunctionWord || d.flags.looksLikeProperNoun,
  );

  const comparison: EvalComparison = {
    generatedAt: new Date().toISOString(),
    lessonId: sampleLesson.id,
    audioFile: 'public/audio/lesson-fr.mp3',
    elevenLabsOverallLoss: elevenRaw.loss,
    responseTextMatches,
    whisper: { coverage: whisperCoverage },
    elevenlabs: { coverage: elevenCoverage, unmapped: elevenUnmapped },
    diffs: {
      count: pairedDiffs.length,
      startTime: { p50: round3(percentile(startDiffsSorted, 50)), p95: round3(percentile(startDiffsSorted, 95)), max: round3(startDiffsSorted.at(-1) ?? 0) },
      endTime: { p50: round3(percentile(endDiffsSorted, 50)), p95: round3(percentile(endDiffsSorted, 95)), max: round3(endDiffsSorted.at(-1) ?? 0) },
      max: { p50: round3(percentile(maxDiffsSorted, 50)), p95: round3(percentile(maxDiffsSorted, 95)), max: round3(maxDiffsSorted.at(-1) ?? 0) },
      top15,
      flaggedForManualCheck,
      all: pairedDiffs,
    },
  };

  await writeFile(path.join(EVAL_DIR, 'comparison.json'), JSON.stringify(comparison, null, 2), 'utf-8');
  await writeFile(
    path.join(EVAL_DIR, 'elevenlabs-timestamps.json'),
    JSON.stringify(Object.fromEntries(elevenMapped.map((m) => [m.tokenId, { startTime: m.startTime, endTime: m.endTime }])), null, 2),
    'utf-8',
  );
  // Копия (не модификация!) существующего production-baseline — только для
  // удобства preview-страницы, чтобы её сервер не лез за пределы evals/.
  await writeFile(
    path.join(EVAL_DIR, 'whisper-timestamps.json'),
    JSON.stringify(Object.fromEntries([...whisperTimed.entries()].map(([id, t]) => [id, { startTime: t.startTime, endTime: t.endTime }])), null, 2),
    'utf-8',
  );
  // Снэпшот структуры урока (текст + диапазоны токенов) для рендера preview
  // без импорта React-приложения — те же buildLessonText spans, что и в проде.
  await writeFile(
    path.join(EVAL_DIR, 'lesson-snapshot.json'),
    JSON.stringify(
      {
        text: lessonText,
        spans,
        tokens: [...tokensById.values()].map((t) => ({ id: t.id, text: t.text, type: t.type })),
      },
      null,
      2,
    ),
    'utf-8',
  );

  await writeFile(path.join(EVAL_DIR, 'report.md'), renderReport(comparison), 'utf-8');

  console.log('\n== Готово ==');
  console.log(`Whisper: покрыто ${whisperCoverage.coveredCount}/${whisperCoverage.totalWordTokens} (${whisperCoverage.coveragePct}%)`);
  console.log(`ElevenLabs: покрыто ${elevenCoverage.coveredCount}/${elevenCoverage.totalWordTokens} (${elevenCoverage.coveragePct}%)`);
  console.log(`Сравнимых токенов (есть у обоих): ${pairedDiffs.length}`);
  console.log(`start diff — p50: ${comparison.diffs.startTime.p50}s, p95: ${comparison.diffs.startTime.p95}s, max: ${comparison.diffs.startTime.max}s`);
  console.log('Отчёт: evals/audio-alignment/report.md');
  console.log('Preview: npm run eval:alignment:preview');
}

main();
