// Клиентская оркестрация входного пайплайна (см. план: браузер сам, шаг за
// шагом, дёргает короткие serverless-эндпоинты — не один долгий job на
// сервере). Каждый await здесь — то, что видно как прогресс в GenerationProgress.

import { tokenizeParagraphs } from '../../../lib/pipeline/tokenize';
import type { InputSource } from '../../../lib/pipeline/generateText';
import { getLanguageConfig, type LanguageCode } from '../../../lib/pipeline/languageConfig';
import { buildLessonText } from '../../lib/lessonText';
import type { AudioProvider, Lesson, Paragraph, Token } from '../../types/lesson';
import { fetchGeneratedText, fetchGeneratedAudio, fetchAudioAlignment, saveLesson } from './lessonsApi';

// Аннотации не генерируются на этапе создания урока (CLAUDE.md) — контент
// объяснения подгружается лениво по клику (см. useSelectedAnnotation.ts).
// Разметки фраз на этом шаге тоже больше нет (Bottom Sheet v2, AI_PIPELINE.md):
// раньше AI заранее решал, какие токены объединить в одну кликабельную
// единицу — теперь каждый word-токен кликабелен сам по себе, «связанная
// фраза» решается внутри самого объяснения, по клику, не заранее. Поэтому
// здесь просто токенизация — ни AI-вызовов, ни какой-либо разметки токенов.

export type GenerationProgress =
  | { stage: 'text' }
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
  options: { level: string; words: number; audioProvider?: AudioProvider; language?: LanguageCode },
  onProgress: (progress: GenerationProgress) => void,
): Promise<{ lesson: Lesson; audioUrl: string }> {
  const audioProvider = options.audioProvider ?? 'openai';
  const language = options.language ?? 'fr';
  const languageConfig = getLanguageConfig(language);

  onProgress({ stage: 'text' });
  const generated = await fetchGeneratedText(input, options.level, options.words, language);

  const paragraphs: Paragraph[] = tokenizeParagraphs(generated.paragraphs, languageConfig.bcp47);
  const slug = slugify(generated.title);

  const lessonForAudio: Lesson = {
    id: slug,
    language: languageConfig.promptLanguageName,
    languageCode: language,
    sourceLanguage: 'Russian',
    level: options.level,
    title: generated.title,
    translatedTitle: generated.translatedTitle,
    estimatedMinutes: generated.estimatedMinutes,
    paragraphs,
    annotations: [],
    audioProvider,
  };

  onProgress({ stage: 'audio' });
  const { text, spans } = buildLessonText(lessonForAudio);
  const wordTokens: Token[] = paragraphs
    .flatMap((p) => p.sentences)
    .flatMap((s) => s.tokens)
    .filter((t) => t.type === 'word');

  const audioResult = await fetchGeneratedAudio(text, slug, audioProvider, language, spans, wordTokens);

  // ElevenLabs — один вызов, тайминги уже в ответе; OpenAI — только TTS,
  // тайминги отдельным вызовом (см. комментарий в api/generate-audio.ts про
  // serverless-таймаут на связке TTS+Whisper).
  let timestampsByToken: Record<string, { startTime: number; endTime: number }>;
  let report = audioResult.report;
  if (audioResult.timestampsByToken && report) {
    timestampsByToken = audioResult.timestampsByToken;
  } else {
    onProgress({ stage: 'align' });
    const aligned = await fetchAudioAlignment(audioResult.audioUrl, wordTokens, language);
    timestampsByToken = aligned.timestampsByToken;
    report = aligned.report;
  }

  const finalLesson: Lesson = {
    ...lessonForAudio,
    alignmentReport: report,
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
  await saveLesson(finalLesson, audioResult.audioUrl);

  return { lesson: finalLesson, audioUrl: audioResult.audioUrl };
}
