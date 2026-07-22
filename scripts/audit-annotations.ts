// Аудит качества объяснений Bottom Sheet: гоняет реальные вызовы
// /api/generate-annotation по целому предложению (каждое слово — своя цель,
// оба тира) и проверяет ответы против правил из
// greek-bottom-sheet-handoff/BOTTOM_SHEET_HANDOFF.md.
//
// Зачем: контент здесь генерирует AI на каждый клик, поэтому обычные юнит-тесты
// ловят только форму данных, но не то, ЧТО модель написала. Промпт может
// «поплыть» после любой правки — этот прогон показывает регрессии текстом, а не
// на глаз по скриншотам.
//
// Использование (нужен поднятый `vercel dev` на :3000):
//   npx tsx scripts/audit-annotations.ts
//   npx tsx scripts/audit-annotations.ts --language=el --sentence="Η Άννα πήγε στον σταθμό." --level=A2
//   npx tsx scripts/audit-annotations.ts --tier=basic          # только тир 1, дешевле
//   npx tsx scripts/audit-annotations.ts --json > audit.json   # машиночитаемо
//
// ВНИМАНИЕ: каждый запуск — реальные платные вызовы OpenAI (примерно
// 2 × количество слов в предложении). Держи предложения короткими.

import { tokenizeParagraphs } from '../lib/pipeline/tokenize.js';
import { getLanguageConfig, type LanguageCode } from '../lib/pipeline/languageConfig.js';
import type { AnnotationSummary, DetailSection, Sentence } from '../src/types/lesson.js';

type Tier = 'basic' | 'details' | 'both';

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const arg = args.find((a) => a.startsWith(`--${flag}=`));
    return arg ? arg.slice(flag.length + 3) : undefined;
  };
  return {
    language: (get('language') ?? 'el') as LanguageCode,
    level: get('level') ?? 'A2',
    sentence: get('sentence') ?? 'Η Άννα πήγε στον σταθμό.',
    baseUrl: get('base-url') ?? 'http://localhost:3000',
    tier: (get('tier') ?? 'both') as Tier,
    json: args.includes('--json'),
  };
}

// Одна проверка = одно правило хэндоффа. `where` — чтобы в отчёте было видно,
// в какой секции сломалось, а не только «что-то не так со словом».
type Finding = { severity: 'fail' | 'warn'; rule: string; where: string; detail: string };

const CYRILLIC = /[Ѐ-ӿ]/;
const LATIN_OR_GREEK = /[A-zͰ-Ͽἀ-῿]/;

function looksAllCaps(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length < 4) return false;
  return letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

// §5 + решение пользователя: начальная форма над контекстом не показывается.
const FORBIDDEN_HINT_LABELS = ['словарная форма', 'начальная форма', 'базовая форма', 'инфинитив'];

function auditSummary(word: string, summary: AnnotationSummary): Finding[] {
  const out: Finding[] = [];
  const at = `«${word}» · summary`;

  if (summary.displayForm !== word) {
    out.push({
      severity: 'fail',
      rule: 'выбранное слово не подменяется',
      where: at,
      detail: `displayForm="${summary.displayForm}", а кликнули "${word}"`,
    });
  }
  if (!summary.translation.trim()) {
    out.push({ severity: 'fail', rule: 'перевод не пустой', where: at, detail: 'translation пустой' });
  }
  if (summary.translation.length > 60) {
    out.push({
      severity: 'warn',
      rule: 'перевод — короткая глосса, не предложение',
      where: at,
      detail: `${summary.translation.length} символов: "${summary.translation}"`,
    });
  }
  if (!CYRILLIC.test(summary.context.translation)) {
    out.push({
      severity: 'fail',
      rule: 'перевод предложения на русском',
      where: at,
      detail: `"${summary.context.translation}"`,
    });
  }

  if (summary.hint) {
    const label = summary.hint.label.toLowerCase();
    if (FORBIDDEN_HINT_LABELS.some((bad) => label.includes(bad))) {
      out.push({
        severity: 'fail',
        rule: 'словарной формы наверху нет',
        where: at,
        detail: `ярлык связки: "${summary.hint.label}"`,
      });
    }
    if (!summary.hint.source.trim() || !summary.hint.translation.trim()) {
      out.push({ severity: 'fail', rule: 'связка заполнена целиком', where: at, detail: JSON.stringify(summary.hint) });
    }
  }

  // Подсветка внутри перевода ищет точное совпадение по границам слова, так что
  // selectedTranslation обязан стоять в переводе предложения ровно в той форме,
  // в какой он там употреблён. Ловилось: глосса «улицы» против «по улицам»,
  // «красивая» против «красивый район» — подсветка молча пропадала.
  const sel = summary.context.selectedTranslation;
  if (sel && !summary.context.translation.toLowerCase().includes(sel.toLowerCase())) {
    out.push({
      severity: 'fail',
      rule: 'подсветка находится в переводе предложения',
      where: at,
      detail: `"${sel}" нет в "${summary.context.translation}"`,
    });
  }

  // Связанная фраза обязана реально встречаться в предложении — иначе
  // подсветка в «В контексте» её не найдёт и слот будет висеть впустую.
  const related = summary.context.relatedSource;
  if (related && !summary.context.source.includes(related)) {
    out.push({
      severity: 'fail',
      rule: 'связанная фраза есть в предложении дословно',
      where: at,
      detail: `"${related}" не найдено в "${summary.context.source}"`,
    });
  }
  if (related && !related.includes(word)) {
    out.push({
      severity: 'fail',
      rule: 'связанная фраза включает выбранное слово',
      where: at,
      detail: `"${related}" не содержит "${word}"`,
    });
  }

  return out;
}

function auditSections(word: string, sections: DetailSection[]): Finding[] {
  const out: Finding[] = [];

  sections.forEach((section, i) => {
    const at = `«${word}» · секция ${i + 1} (${section.type})`;
    const title = 'title' in section ? section.title : null;

    if (title && looksAllCaps(title)) {
      out.push({ severity: 'fail', rule: 'нет заголовков в CAPS', where: at, detail: `"${title}"` });
    }
    if (section.type !== 'grammarNote' && !title) {
      out.push({ severity: 'warn', rule: 'у секции есть заголовок', where: at, detail: 'title = null' });
    }
    if (title && !CYRILLIC.test(title)) {
      out.push({ severity: 'fail', rule: 'пояснения по-русски', where: at, detail: `заголовок: "${title}"` });
    }
    // Реально ловилось: модель копировала английский пример из промпта
    // дословно и отдавала grammarNote «aorist, 3rd person singular».
    if ((section.type === 'explanation' || section.type === 'grammarNote') && !CYRILLIC.test(section.body)) {
      out.push({ severity: 'fail', rule: 'пояснения по-русски', where: at, detail: `"${section.body}"` });
    }

    if (section.type === 'table') {
      if (section.rows.length === 0) {
        out.push({ severity: 'fail', rule: 'таблица не пустая', where: at, detail: 'rows = []' });
      }
      const widths = new Set(section.rows.map((r) => r.length));
      if (widths.size > 1) {
        out.push({
          severity: 'fail',
          rule: 'строки таблицы одной ширины',
          where: at,
          detail: `ширины строк: ${[...widths].join(', ')}`,
        });
      }
      if (section.rows.some((r) => r.length < 3)) {
        out.push({
          severity: 'warn',
          rule: 'таблица в три колонки: ярлык, форма, перевод',
          where: at,
          detail: `ширина строки ${section.rows[0]?.length}: ${JSON.stringify(section.rows[0])}`,
        });
      }
      // Ключевое правило приёмки: у каждой строки с иноязычной формой должен
      // быть русский перевод. Именно это ломалось на «Единственное/
      // Множественное число» без переводов.
      for (const row of section.rows) {
        const hasForeign = row.some((cell) => LATIN_OR_GREEK.test(cell));
        const hasRussian = row.some((cell) => CYRILLIC.test(cell));
        if (hasForeign && !hasRussian) {
          out.push({
            severity: 'fail',
            rule: 'у каждой формы есть русский перевод',
            where: at,
            detail: JSON.stringify(row),
          });
        }
      }
    }

    if (section.type === 'bilingualPairs') {
      if (section.pairs.length === 0) {
        out.push({ severity: 'fail', rule: 'пары не пустые', where: at, detail: 'pairs = []' });
      }
      for (const pair of section.pairs) {
        if (!CYRILLIC.test(pair.translation)) {
          out.push({
            severity: 'fail',
            rule: 'у каждого примера есть русский перевод',
            where: at,
            detail: `"${pair.source}" → "${pair.translation}"`,
          });
        }
      }
    }
  });

  // §4 / критерий приёмки: не дублировать уже показанное.
  const bodies = sections
    .map((s) => (s.type === 'explanation' || s.type === 'grammarNote' ? s.body : ''))
    .filter(Boolean)
    .map((b) => b.trim().toLowerCase());
  if (new Set(bodies).size !== bodies.length) {
    out.push({
      severity: 'fail',
      rule: 'нет повторяющихся секций',
      where: `«${word}» · details`,
      detail: 'два текстовых блока совпадают дословно',
    });
  }

  return out;
}

async function post<T>(baseUrl: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}/api/generate-annotation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

async function main() {
  const opts = parseArgs();
  const languageConfig = getLanguageConfig(opts.language);
  const [paragraph] = tokenizeParagraphs([opts.sentence], languageConfig.bcp47);
  const sentence: Sentence = paragraph.sentences[0];
  const words = sentence.tokens.filter((t) => t.type === 'word');

  if (!opts.json) {
    console.log(`Предложение: «${sentence.text}»`);
    console.log(`Язык: ${languageConfig.displayName} · уровень: ${opts.level} · слов: ${words.length}`);
    console.log(`Тир: ${opts.tier}\n`);
  }

  const findings: Finding[] = [];
  const dump: Record<string, unknown> = {};

  for (const token of words) {
    const target = { tokenId: token.id, sentence };
    const record: Record<string, unknown> = {};

    try {
      if (opts.tier === 'basic' || opts.tier === 'both') {
        const summary = await post<AnnotationSummary>(opts.baseUrl, {
          target,
          level: opts.level,
          tier: 'basic',
          language: opts.language,
        });
        record.summary = summary;
        findings.push(...auditSummary(token.text, summary));

        if (!opts.json) {
          const hint = summary.hint ? `${summary.hint.label}: ${summary.hint.source} → ${summary.hint.translation}` : '—';
          console.log(`▸ ${token.text}  [${summary.partOfSpeech ?? 'без части речи'}]  «${summary.translation}»`);
          console.log(`    связка: ${hint}`);
        }
      }

      if (opts.tier === 'details' || opts.tier === 'both') {
        const { sections } = await post<{ sections: DetailSection[] }>(opts.baseUrl, {
          target,
          level: opts.level,
          tier: 'details',
          language: opts.language,
        });
        record.sections = sections;
        findings.push(...auditSections(token.text, sections));

        if (!opts.json) {
          const shape = sections
            .map((s) => (s.type === 'table' ? `table(${s.rows.length})` : s.type === 'bilingualPairs' ? `pairs(${s.pairs.length})` : s.type))
            .join(' → ');
          console.log(`    детали: ${shape || '(пусто)'}`);
        }
      }
    } catch (err) {
      findings.push({
        severity: 'fail',
        rule: 'запрос отработал',
        where: `«${token.text}»`,
        detail: err instanceof Error ? err.message : String(err),
      });
      if (!opts.json) console.log(`▸ ${token.text}  ✗ ${err instanceof Error ? err.message : err}`);
    }

    dump[token.text] = record;
  }

  if (opts.json) {
    console.log(JSON.stringify({ sentence: sentence.text, findings, annotations: dump }, null, 2));
    return;
  }

  const fails = findings.filter((f) => f.severity === 'fail');
  const warns = findings.filter((f) => f.severity === 'warn');

  console.log(`\n${'─'.repeat(60)}`);
  if (findings.length === 0) {
    console.log('✓ Все проверки пройдены.');
  } else {
    for (const group of [fails, warns]) {
      for (const f of group) {
        console.log(`${f.severity === 'fail' ? '✗' : '!'} [${f.rule}] ${f.where}\n    ${f.detail}`);
      }
    }
    console.log(`\nНарушений: ${fails.length} · предупреждений: ${warns.length}`);
  }

  process.exit(fails.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
