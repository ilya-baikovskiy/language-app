// Тонкие обёртки над /api/* — сам пайплайн оркестрируется на клиенте
// (см. generateLessonPipeline.ts), сервер только делает отдельные короткие
// AI-вызовы. Ни один секретный ключ сюда не попадает — он есть только на
// сервере (Vercel env).

import type { InputSource, GeneratedText } from '../../../lib/pipeline/generateText';
import type { PhraseGroup } from '../../../lib/pipeline/markPhrases';
import type {
  AnnotationBasicContent,
  AnnotationDetailsContent,
  AnnotationTarget,
} from '../../../lib/pipeline/generateAnnotations';
import type { Lesson, Sentence, Token } from '../../types/lesson';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export function fetchGeneratedText(input: InputSource, level: string, words: number): Promise<GeneratedText> {
  return postJson('/api/generate-text', { input, level, words });
}

export async function fetchPhraseGroups(sentence: Sentence): Promise<PhraseGroup[]> {
  const { groups } = await postJson<{ groups: PhraseGroup[] }>('/api/mark-phrases', { sentence });
  return groups;
}

// Тир 1 — по клику по слову (лёгкое базовое объяснение).
export function fetchAnnotationBasic(target: AnnotationTarget, level: string): Promise<AnnotationBasicContent> {
  return postJson('/api/generate-annotation', { target, level, tier: 'basic' });
}

// Тир 2 — по клику «Подробнее» (грамматика и формы).
export function fetchAnnotationDetails(target: AnnotationTarget, level: string): Promise<AnnotationDetailsContent> {
  return postJson('/api/generate-annotation', { target, level, tier: 'details' });
}

export function fetchGeneratedAudio(text: string, slug: string): Promise<{ audioUrl: string }> {
  return postJson('/api/generate-audio', { text, slug });
}

export function fetchAudioAlignment(
  audioUrl: string,
  wordTokens: Token[],
): Promise<{ timestampsByToken: Record<string, { startTime: number; endTime: number }>; unmatched: string[] }> {
  return postJson('/api/align-audio', { audioUrl, wordTokens });
}

export function saveLesson(lesson: Lesson, audioUrl: string): Promise<{ slug: string; lessonUrl: string }> {
  return postJson('/api/save-lesson', { lesson, audioUrl });
}

export type LessonIndexEntry = {
  id: string;
  slug: string;
  title: string;
  translatedTitle?: string;
  level: string;
  estimatedMinutes: number;
  lessonUrl: string;
  audioUrl: string;
  createdAt: string;
};

export async function fetchLessonsIndex(): Promise<LessonIndexEntry[]> {
  const res = await fetch('/api/lessons');
  if (!res.ok) return [];
  return (await res.json()) as LessonIndexEntry[];
}
