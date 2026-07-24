// One-off/reusable QA driver for Content System v1.2 — see QA_TESTING.md.
// Drives the real preview deployment with a real Chromium (pre-installed in
// this environment, see PLAYWRIGHT_BROWSERS_PATH), not just curl: clicks
// through Choose -> card generation -> Reader -> Bottom Sheet for a spread of
// tokens, and dumps extracted TEXT (not just screenshots) so the actual AI
// output can be read and judged against lib/pipeline/generateAnnotations.ts's
// own rules (tier 2 structure per part of speech), not just visually diffed.
//
// Deliberately generates only ONE lesson via the card feed (not all 5 cards)
// to limit real OpenAI/ElevenLabs spend — see QA_TESTING.md for rationale.
//
// Usage:
//   QA_BASE_URL=... QA_VERCEL_BYPASS=... node scripts/qa-playwright-check.mjs
// Optional: QA_OUT_DIR (default ./qa-out), QA_MAX_TOKENS (default 18),
//           QA_SKIP_MANUAL=1 to skip the manual-generation smoke check.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE_URL = process.env.QA_BASE_URL;
const BYPASS = process.env.QA_VERCEL_BYPASS;
const OUT_DIR = process.env.QA_OUT_DIR || './qa-out';
const MAX_TOKENS_TO_SAMPLE = Number(process.env.QA_MAX_TOKENS || 18);
const SKIP_MANUAL = process.env.QA_SKIP_MANUAL === '1';

if (!BASE_URL || !BYPASS) {
  console.error('Set QA_BASE_URL and QA_VERCEL_BYPASS env vars.');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const report = { startedAt: new Date().toISOString(), steps: [], tokens: [] };

function log(step, detail) {
  console.log(`[qa] ${step}${detail ? ': ' + detail : ''}`);
  report.steps.push({ step, detail, at: new Date().toISOString() });
}

async function closeSheetIfOpen(page) {
  await page.locator('.sheet-overlay.is-open').click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(200);
}

async function main() {
  // This sandbox routes all outbound HTTPS through a local TLS-terminating
  // proxy (see $HTTPS_PROXY) — Chromium doesn't pick that up from the env
  // automatically the way curl/Node's fetch do, so it must be passed as an
  // explicit launch arg, and its CA (self-signed from Chromium's POV) needs
  // --ignore-certificate-errors. This is our own controlled sandbox egress
  // proxy for a throwaway QA script hitting our own preview deployment, not a
  // real TLS trust decision about untrusted third-party content.
  const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: [
      ...(proxyServer ? [`--proxy-server=${proxyServer}`] : []),
      '--ignore-certificate-errors',
      // Running as root in this sandbox — Chromium's setuid sandbox refuses
      // to initialize as root without this (unrelated to the proxy issue,
      // but was masking it as a generic connection failure).
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); // iPhone-ish narrow viewport
  await context.setExtraHTTPHeaders({ 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') log('console.error', msg.text());
  });
  page.on('pageerror', (err) => log('pageerror', String(err)));

  log('goto', BASE_URL);
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('.app-topbar', { timeout: 15000 }).catch(() => {});
  await page.screenshot({ path: `${OUT_DIR}/01-choose.png`, fullPage: true });

  // --- Choose feed: log all 5 cards' content, but only GENERATE from one ---
  await page.waitForSelector('.content-card', { timeout: 20000 });
  const cards = await page.$$eval('.content-card', (nodes) =>
    nodes.map((n) => ({
      isHero: n.classList.contains('content-card-hero'),
      title: n.querySelector('.content-card-title')?.textContent?.trim(),
      description: n.querySelector('.content-card-description')?.textContent?.trim(),
      chips: Array.from(n.querySelectorAll('.content-card-chip')).map((c) => c.textContent?.trim()),
    })),
  );
  log('feed cards (all 5, logged only — generating just the hero)', JSON.stringify(cards, null, 2));
  report.feedCards = cards;

  // --- Click "Читать" on the hero card only ---
  const heroReadButton = page.locator('.content-card-hero .btn.primary', { hasText: 'Читать' });
  await heroReadButton.click();
  log('clicked Читать on hero card (single generation, not all 5)');
  await page.screenshot({ path: `${OUT_DIR}/02-generating.png` });

  // --- Wait for generation to finish (real OpenAI+ElevenLabs calls — can take a while) ---
  await page.waitForSelector('.reader-header, .article-content', { timeout: 180000 });
  log('reader appeared');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT_DIR}/03-reader.png`, fullPage: true });

  // --- Full lesson text, so the actual AI story can be read, not just eyeballed ---
  const lessonText = await page.$eval('.article-content', (el) => el.textContent?.trim() ?? '');
  report.lessonText = lessonText;
  writeFileSync(`${OUT_DIR}/lesson-text.txt`, lessonText);
  log('lesson text captured', `${lessonText.length} chars`);

  const headerTitle = await page.locator('.reader-title, h1').first().textContent().catch(() => null);
  log('reader title', headerTitle || '(none found)');

  // --- Sample tokens spread across the lesson, open tier 1 + tier 2 for each ---
  const tokenHandles = await page.$$('.tok');
  const total = tokenHandles.length;
  log('total clickable tokens', String(total));
  const sampleIndices = [...new Set(
    Array.from({ length: MAX_TOKENS_TO_SAMPLE }, (_, i) => Math.floor((i / MAX_TOKENS_TO_SAMPLE) * total)),
  )];

  for (const idx of sampleIndices) {
    const tokenEl = tokenHandles[idx];
    if (!tokenEl) continue;
    const tokenText = await tokenEl.textContent();
    try {
      await tokenEl.click();
      await page.waitForSelector('.sheet.is-open', { timeout: 8000 });
      await page.waitForSelector('.sheet.is-open .sheet-loading', { state: 'detached', timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(300);

      const tier1 = await page.evaluate(() => {
        const sheet = document.querySelector('.sheet.is-open');
        if (!sheet) return null;
        return {
          partOfSpeech: sheet.querySelector('.sheet-pos')?.textContent?.trim() ?? null,
          displayForm: sheet.querySelector('.sheet-head')?.textContent?.trim() ?? null,
          translation: sheet.querySelector('.sheet-translation')?.textContent?.trim() ?? null,
          hintLabel: sheet.querySelector('.sheet-hint-label')?.textContent?.trim() ?? null,
          hintRow: sheet.querySelector('.sheet-hint-row')?.textContent?.trim() ?? null,
          contextSentence: sheet.querySelector('.sheet-sentence')?.textContent?.trim() ?? null,
          contextTranslation: sheet.querySelector('.sheet-context-translation')?.textContent?.trim() ?? null,
        };
      });

      await page.screenshot({ path: `${OUT_DIR}/token-${idx}-tier1.png` });

      // Click "Подробнее" for tier 2, if present (self-evident words may not need it,
      // but the button should still be there per current ExplanationSheet.tsx)
      let tier2 = null;
      const moreButton = page.locator('.sheet.is-open .sheet-more-toggle');
      if (await moreButton.count()) {
        await moreButton.click();
        await page.waitForSelector('.sheet.is-open .sheet-loading', { state: 'detached', timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(500);
        tier2 = await page.evaluate(() => {
          const sheet = document.querySelector('.sheet.is-open');
          if (!sheet) return null;
          // Grab structured sections, not just flattened text, so table shape
          // (no header row, 3 cells) can actually be checked afterwards.
          const sections = [];
          sheet.querySelectorAll('.sheet-section-title').forEach((titleEl) => {
            sections.push({ kind: 'title', text: titleEl.textContent?.trim() });
          });
          const tables = Array.from(sheet.querySelectorAll('.sheet-table')).map((t) =>
            Array.from(t.querySelectorAll('tr')).map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim())),
          );
          const bilingualPairs = Array.from(sheet.querySelectorAll('.bilingual-pair')).map((p) => p.textContent?.trim());
          const fullText = sheet.querySelector('.sheet-body:last-of-type')?.innerText?.trim()
            ?? sheet.querySelector('.sheet-body')?.innerText?.trim()
            ?? null;
          return { sections, tables, bilingualPairs, fullText };
        });
        await page.screenshot({ path: `${OUT_DIR}/token-${idx}-tier2.png` });
      }

      report.tokens.push({ idx, tokenText, tier1, tier2 });
      log(`token[${idx}] "${tokenText}"`, JSON.stringify(tier1));

      await closeSheetIfOpen(page);
    } catch (err) {
      report.tokens.push({ idx, tokenText, error: String(err) });
      log(`token[${idx}] "${tokenText}" ERROR`, String(err));
      await closeSheetIfOpen(page);
    }
  }

  // --- Manual generation smoke check (must keep working, per user — cheapest settings) ---
  if (!SKIP_MANUAL) {
    try {
      await page.locator('.bottom-nav-shell [data-nav="library"], .nav-item', { hasText: 'Мои тексты' }).first().click();
      await page.waitForTimeout(500);
      await page.locator('.btn.primary', { hasText: 'Новый урок' }).click();
      await page.waitForSelector('.generate-form', { timeout: 10000 });
      await page.locator('#topic-input').fill('un chat qui dort au soleil');
      // Cheapest word count option already selected by default (100) — leave as-is.
      await page.locator('button[type="submit"]', { hasText: 'Сгенерировать' }).click();
      log('manual generation submitted (100 words, topic mode)');
      await page.waitForSelector('.reader-header, .article-content', { timeout: 180000 });
      log('manual generation reached Reader — still works');
      await page.screenshot({ path: `${OUT_DIR}/04-manual-generation-reader.png`, fullPage: true });
    } catch (err) {
      log('manual generation FAILED', String(err));
      report.manualGenerationError = String(err);
    }
  }

  writeFileSync(`${OUT_DIR}/report.json`, JSON.stringify(report, null, 2));
  log('done — report written to', `${OUT_DIR}/report.json`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  writeFileSync(`${OUT_DIR}/report.json`, JSON.stringify(report, null, 2));
  process.exit(1);
});
