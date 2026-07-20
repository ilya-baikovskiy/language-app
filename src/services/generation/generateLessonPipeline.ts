// Клиентская оркестрация входного пайплайна (см. план: браузер сам, шаг за
// шагом, дёргает короткие serverless-эндпоинты — не один долгий job на
// сервере). Каждый await здесь — то, что видно как прогресс в GenerationProgress.

import { tokenizeParagraphs } from '../../../lib/pipeline/tokenize';
import { collectAnnotationTargets, mergeAnnotationResults, type AnnotationResult } from '../../../lib/pipeline/generateAnnotations';
import type { InputSource } from '../../../lib/pipeline/generateText';
import { buildLessonText } from '../../lib/lessonText';
import type { Lesson, Paragraph, Token } from '../../types/lesson';
import {
  fetchGeneratedText,
  fetchPhraseGroups,
  fetchAnnotationContent,
  fetchGeneratedAudio,
  fetchAudioAlignment,
  saveLesson,
} from './lessonsApi';

export type GenerationProgress =
  | { stage: 'text' }
  | { stage: 'phrases'; done: number; total: number }
  | { stage: 'annotations'; done: number; total: number; failed: number }
  | { stage: 'audio' }
  | { stage: 'align' }
  | { stage: 'saving' };

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${base || 'lesson'}-${Date.now().toString(36)}`;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function generateLesson(
  input: InputSource,
  options: { level: string; words: number },
  onProgress: (progress: GenerationProgress) => void,
): Promise<{ lesson: Lesson; audioUrl: string }> {
  onProgress({ stage: 'text' });
  const generated = await fetchGeneratedText(input, options.level, options.words);

  const paragraphs: Paragraph[] = tokenizeParagraphs(generated.paragraphs);
  const sentences = paragraphs.flatMap((p) => p.sentences);

  const phraseGroups = [];
  for (let i = 0; i < sentences.length; i++) {
    onProgress({ stage: 'phrases', done: i, total: sentences.length });
    phraseGroups.push(...(await fetchPhraseGroups(sentences[i])));
  }
  onProgress({ stage: 'phrases', done: sentences.length, total: sentences.length });

  const targets = collectAnnotationTargets(paragraphs, phraseGroups);
  let annotated = 0;
  let annotationsFailed = 0;
  const results = await mapWithConcurrency<(typeof targets)[number], AnnotationResult | null>(
    targets,
    2,
    async (target) => {
      try {
        const content = await fetchAnnotationContent(target, options.level);
        annotated++;
        onProgress({ stage: 'annotations', done: annotated, total: targets.length, failed: annotationsFailed });
        return { target, content };
      } catch (err) {
        annotationsFailed++;
        onProgress({ stage: 'annotations', done: annotated, total: targets.length, failed: annotationsFailed });
        console.error(`Не удалось объяснить "${target.displayText}":`, err);
        return null;
      }
    },
  );

  const merged = mergeAnnotationResults(paragraphs, results);
  const slug = slugify(generated.title);

  const lessonForAudio: Lesson = {
    id: slug,
    language: 'French',
    sourceLanguage: 'Russian',
    level: options.level,
    title: generated.title,
    translatedTitle: generated.translatedTitle,
    estimatedMinutes: generated.estimatedMinutes,
    paragraphs: merged.paragraphs,
    annotations: merged.annotations,
  };

  onProgress({ stage: 'audio' });
  const { text } = buildLessonText(lessonForAudio);
  const { audioUrl } = await fetchGeneratedAudio(text, slug);

  onProgress({ stage: 'align' });
  const wordTokens: Token[] = merged.paragraphs
    .flatMap((p) => p.sentences)
    .flatMap((s) => s.tokens)
    .filter((t) => t.type === 'word');
  const { timestampsByToken } = await fetchAudioAlignment(audioUrl, wordTokens);

  const finalLesson: Lesson = {
    ...lessonForAudio,
    paragraphs: lessonForAudio.paragraphs.map((paragraph) => ({
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

  onProgress({ stage: 'saving' });
  await saveLesson(finalLesson, audioUrl);

  return { lesson: finalLesson, audioUrl };
}
