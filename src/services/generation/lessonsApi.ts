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
import type { LanguageCode } from '../../../lib/pipeline/languageConfig';
import type { AlignmentReport } from '../../../lib/pipeline/alignmentReport';
import type { AudioProvider, Lesson, Sentence, Token } from '../../types/lesson';
import type { TokenSpan } from '../../lib/lessonText';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const bodyText = await res.text();
    // Ошибки quality gate (422) приходят как {error, report} — вытаскиваем
    // человекочитаемую причину, а не показываем сырой JSON пользователю.
    let message = `${url}: ${res.status} ${bodyText}`;
    try {
      const parsed = JSON.parse(bodyText) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      // Тело не JSON — оставляем как есть.
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export function fetchGeneratedText(input: InputSource, level: string, words: number, language: LanguageCode): Promise<GeneratedText> {
  return postJson('/api/generate-text', { input, level, words, language });
}

export async function fetchPhraseGroups(sentence: Sentence, language: LanguageCode): Promise<PhraseGroup[]> {
  const { groups } = await postJson<{ groups: PhraseGroup[] }>('/api/mark-phrases', { sentence, language });
  return groups;
}

// Тир 1 — по клику по слову (лёгкое базовое объяснение).
export function fetchAnnotationBasic(target: AnnotationTarget, level: string, language: LanguageCode): Promise<AnnotationBasicContent> {
  return postJson('/api/generate-annotation', { target, level, tier: 'basic', language });
}

// Тир 2 — по клику «Подробнее» (грамматика и формы).
export function fetchAnnotationDetails(target: AnnotationTarget, level: string, language: LanguageCode): Promise<AnnotationDetailsContent> {
  return postJson('/api/generate-annotation', { target, level, tier: 'details', language });
}

// Перевод одного предложения — по запросу в режиме перевода (тумблер «Перевод»).
export async function fetchSentenceTranslation(sentenceText: string, level: string, language: LanguageCode): Promise<string> {
  const { translation } = await postJson<{ translation: string }>('/api/translate-sentence', { sentenceText, level, language });
  return translation;
}

// Для elevenlabs это ОДИН вызов — эндпоинт делает TTS+выравнивание+quality
// gate целиком и сразу отдаёт timestampsByToken/report; для openai — только
// TTS, тайминги приходят отдельным вызовом fetchAudioAlignment ниже (см.
// комментарий в api/generate-audio.ts про serverless-таймаут).
export function fetchGeneratedAudio(
  text: string,
  slug: string,
  provider: AudioProvider,
  language: LanguageCode,
  spans: TokenSpan[],
  wordTokens: Token[],
): Promise<{ audioUrl: string; timestampsByToken?: Record<string, { startTime: number; endTime: number }>; report?: AlignmentReport }> {
  return postJson('/api/generate-audio', { text, slug, provider, language, spans, wordTokens });
}

// Только для openai-пути (align-audio.ts больше не принимает elevenlabs —
// см. fetchGeneratedAudio выше, там всё приходит одним вызовом).
export function fetchAudioAlignment(
  audioUrl: string,
  wordTokens: Token[],
  language: LanguageCode,
): Promise<{ timestampsByToken: Record<string, { startTime: number; endTime: number }>; report: AlignmentReport }> {
  return postJson('/api/align-audio', { audioUrl, wordTokens, language });
}

// Клип отдельного слова/фразы для Bottom Sheet (не нарезка общей дорожки —
// см. api/speak-unit.ts). provider обязателен и должен совпадать с
// lesson.audioProvider, чтобы голос клипа не расходился с голосом урока.
export function fetchUnitClip(
  text: string,
  language: LanguageCode,
  provider: AudioProvider,
): Promise<{ audioUrl: string; audioBase64?: string }> {
  return postJson('/api/speak-unit', { text, language, provider });
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
  audioProvider?: AudioProvider;
  languageCode?: string;
  createdAt: string;
};

export async function fetchLessonsIndex(): Promise<LessonIndexEntry[]> {
  const res = await fetch('/api/lessons');
  if (!res.ok) return [];
  return (await res.json()) as LessonIndexEntry[];
}
