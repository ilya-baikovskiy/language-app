// Клиентская оркестрация входного пайплайна (см. план: браузер сам, шаг за
// шагом, дёргает короткие serverless-эндпоинты — не один долгий job на
// сервере). Каждый await здесь — то, что видно как прогресс в GenerationProgress.

import { tokenizeParagraphs } from '../../../lib/pipeline/tokenize';
import { collectAnnotationTargets, stampAnnotationTargets } from '../../../lib/pipeline/generateAnnotations';
import type { InputSource } from '../../../lib/pipeline/generateText';
import { buildLessonText } from '../../lib/lessonText';
import type { Lesson, Paragraph, Token } from '../../types/lesson';
import {
  fetchGeneratedText,
  fetchPhraseGroups,
  fetchGeneratedAudio,
  fetchAudioAlignment,
  saveLesson,
} from './lessonsApi';

// Аннотации больше не генерируются на этапе создания урока (CLAUDE.md) — это
// было доминирующей статьёй времени генерации (90-150 вызовов OpenAI, по
// одному на слово/фразу). Разметка фраз (stage 'phrases') остаётся: она
// дешёвая (~1 вызов на предложение) и структурно необходима — именно она
// говорит читалке, что несколько токенов подряд («s'est levé») — одна
// кликабельная единица. Сам текст объяснения подгружается лениво по клику
// (см. useSelectedAnnotation.ts), поэтому здесь только stampAnnotationTargets
// (чистая функция, без сети) — lesson.annotations стартует пустым массивом.

export type GenerationProgress =
  | { stage: 'text' }
  | { stage: 'phrases'; done: number; total: number }
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
  const stampedParagraphs = stampAnnotationTargets(paragraphs, targets);
  const slug = slugify(generated.title);

  const lessonForAudio: Lesson = {
    id: slug,
    language: 'French',
    sourceLanguage: 'Russian',
    level: options.level,
    title: generated.title,
    translatedTitle: generated.translatedTitle,
    estimatedMinutes: generated.estimatedMinutes,
    paragraphs: stampedParagraphs,
    annotations: [],
  };

  onProgress({ stage: 'audio' });
  const { text } = buildLessonText(lessonForAudio);
  const { audioUrl } = await fetchGeneratedAudio(text, slug);

  onProgress({ stage: 'align' });
  const wordTokens: Token[] = stampedParagraphs
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
