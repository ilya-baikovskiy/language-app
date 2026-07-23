// Тонкие обёртки над /api/* — сам пайплайн оркестрируется на клиенте
// (см. generateLessonPipeline.ts), сервер только делает отдельные короткие
// AI-вызовы. Ни один секретный ключ сюда не попадает — он есть только на
// сервере (Vercel env).

import type { InputSource, GeneratedText } from '../../../lib/pipeline/generateText';
import type { AnnotationTarget } from '../../../lib/pipeline/generateAnnotations';
import type { LanguageCode } from '../../../lib/pipeline/languageConfig';
import type { AlignmentReport } from '../../../lib/pipeline/alignmentReport';
import type { AudioProvider, AnnotationSummary, DetailSection, Lesson, Token } from '../../types/lesson';
import type { TokenSpan } from '../../lib/lessonText';
import type { LessonStatus } from '../../content-system/types';

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

// Тир 1 — по клику по слову (короткое объяснение). Один токен — своя цель,
// нет больше пре-пасса разметки фраз (см. AI_PIPELINE.md, «Bottom Sheet v2»).
export function fetchAnnotationBasic(target: AnnotationTarget, level: string, language: LanguageCode): Promise<AnnotationSummary> {
  return postJson('/api/generate-annotation', { target, level, tier: 'basic', language });
}

// Тир 2 — по клику «Подробнее» (типизированные секции).
export function fetchAnnotationDetails(target: AnnotationTarget, level: string, language: LanguageCode): Promise<{ sections: DetailSection[] }> {
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

// meta — cardId/blueprintId для card → Lesson флоу (PR 3). Не используется
// текущим generateLessonPipeline.ts (единственная правка там — lessonId, см.
// комментарий в generateLesson) — эти поля сохраняются в индексе через уже
// существующую 'creating'-запись (api/lesson-status.ts startLesson), которую
// api/save-lesson.ts подхватывает по id/slug, если meta не передан явно.
export function saveLesson(
  lesson: Lesson,
  audioUrl: string,
  meta?: { cardId?: string; blueprintId?: string },
): Promise<{ slug: string; lessonUrl: string }> {
  return postJson('/api/save-lesson', { lesson, audioUrl, ...meta });
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
  // Отсутствует у записей до PR 3 (легаси) — необязательное, чтобы старые
  // записи из Blob не ломали типизацию; репозиторий-слой маппит их в 'ready'.
  status?: LessonStatus;
  cardId?: string;
  blueprintId?: string;
};

export type StartLessonEntry = {
  id: string;
  slug: string;
  title: string;
  translatedTitle?: string;
  level: string;
  estimatedMinutes: number;
  languageCode?: string;
  cardId: string;
  blueprintId: string;
};

export function startLesson(entry: StartLessonEntry): Promise<{ ok: boolean }> {
  return postJson('/api/lesson-status', { action: 'start', entry });
}

export function markLessonFailed(lessonId: string): Promise<{ ok: boolean }> {
  return postJson('/api/lesson-status', { action: 'fail', lessonId });
}

// Бросает при недоступном /api/lessons вместо тихого пустого списка: иначе
// упавший бэкенд выглядит на экране библиотеки ровно как «уроков ещё нет»,
// и сохранённые уроки кажутся потерянными (реально ловилось на падении
// `vercel dev`). Состояние ошибки разбирает LibraryPage.
export async function fetchLessonsIndex(): Promise<LessonIndexEntry[]> {
  const res = await fetch('/api/lessons');
  if (!res.ok) throw new Error(`/api/lessons: ${res.status}`);
  return (await res.json()) as LessonIndexEntry[];
}
