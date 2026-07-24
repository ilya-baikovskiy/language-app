// One-off helper for QA_TESTING.md §9 — tokenizes a generated lesson's raw
// paragraphs the same way the real pipeline does (tokenize.ts), so annotation
// requests sent to /api/generate-annotation use real Sentence/Token objects,
// not hand-rolled ones.
import { readFileSync, writeFileSync } from 'node:fs';
import { tokenizeParagraphs } from '../lib/pipeline/tokenize.ts';

const [, , inputPath, outputPath, bcp47 = 'fr-FR'] = process.argv;
const raw = JSON.parse(readFileSync(inputPath, 'utf-8'));
const paragraphs = tokenizeParagraphs(raw.paragraphs, bcp47);
writeFileSync(outputPath, JSON.stringify({ title: raw.title, paragraphs }, null, 2));
console.log(`Wrote ${outputPath}`);
