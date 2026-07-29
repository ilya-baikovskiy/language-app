// Озвучка целого предложения в source-режиме тренировки берётся из уже
// сгенерированной дорожки урока (нарезка по timestamps), а не новым TTS-
// вызовом на всё предложение: /api/speak-unit жёстко режет текст длиннее 80
// символов (см. MAX_TEXT_LENGTH в api/speak-unit.ts — эндпоинт для
// слова/фразы, не абзаца), а полное предложение урока обычно длиннее. Плюс
// это не тратит токены на генерацию клипа, которого при желании уже есть
// готовая озвучка.
import { BlobLessonArtifactRepository } from '../content-system/repositories/lessonArtifactRepository';
import type { SavedWord } from '../content-system/savedWord';

const lessonArtifactRepository = new BlobLessonArtifactRepository();
const lessonCache = new Map<string, ReturnType<typeof lessonArtifactRepository.getLesson>>();
let lessonSummariesCache: ReturnType<typeof lessonArtifactRepository.listLessons> | null = null;

function getLessonCached(lessonId: string) {
  let cached = lessonCache.get(lessonId);
  if (!cached) {
    cached = lessonArtifactRepository.getLesson(lessonId);
    lessonCache.set(lessonId, cached);
  }
  return cached;
}

function getLessonSummariesCached() {
  if (!lessonSummariesCache) lessonSummariesCache = lessonArtifactRepository.listLessons();
  return lessonSummariesCache;
}

export type SentenceAudioSegment = { audioUrl: string; start: number; end: number };

export async function getSentenceAudioSegment(word: SavedWord): Promise<SentenceAudioSegment | null> {
  const [lesson, summaries] = await Promise.all([
    getLessonCached(word.lessonId),
    getLessonSummariesCached(),
  ]);
  if (!lesson) return null;
  const audioUrl = summaries.find((entry) => entry.id === word.lessonId)?.audioUrl;
  if (!audioUrl) return null;

  for (const paragraph of lesson.paragraphs) {
    for (const sentence of paragraph.sentences) {
      if (!sentence.tokens.some((token) => token.id === word.tokenId)) continue;
      const timedTokens = sentence.tokens.filter(
        (token) => token.startTime != null && token.endTime != null,
      );
      if (timedTokens.length === 0) return null;
      const start = timedTokens[0].startTime as number;
      const end = timedTokens[timedTokens.length - 1].endTime as number;
      return { audioUrl, start, end };
    }
  }
  return null;
}

export function playAudioSegment(segment: SentenceAudioSegment): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(segment.audioUrl);
    const stopAtEnd = () => {
      if (audio.currentTime >= segment.end) {
        audio.pause();
        audio.removeEventListener('timeupdate', stopAtEnd);
        resolve();
      }
    };
    audio.addEventListener('timeupdate', stopAtEnd);
    audio.addEventListener('ended', () => resolve());
    audio.addEventListener('error', () => reject(new Error('Не удалось загрузить озвучку урока')));
    audio.addEventListener('loadedmetadata', () => {
      audio.currentTime = segment.start;
      audio.play().catch(reject);
    });
  });
}
