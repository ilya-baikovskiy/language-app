// LessonArtifactRepository adapter — оборачивает существующий Lesson/Blob
// flow (src/services/generation/lessonsApi.ts), не меняя его. См.
// 11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md §«Первая реализация storage»:
// «Adapter поверх существующего Blob save/list/load flow.»
//
// getLesson не имеет отдельного эндпоинта в текущем коде (см.
// IMPLEMENTATION_DISCOVERY.md) — App.tsx уже сейчас находит урок только через
// index + fetch(entry.lessonUrl), поэтому adapter делает то же самое.

import type { Lesson } from '../../types/lesson';
import { fetchLessonsIndex, saveLesson as saveLessonToBlob } from '../../services/generation/lessonsApi';
import type { LessonArtifactRepository } from '../repositories';
import type { LessonArtifactRef, LessonSummary } from '../types';

export class BlobLessonArtifactRepository implements LessonArtifactRepository {
  async saveLesson(lesson: Lesson, audioUrl: string): Promise<LessonArtifactRef> {
    const { slug, lessonUrl } = await saveLessonToBlob(lesson, audioUrl);
    return { lessonId: slug, lessonUrl, audioUrl };
  }

  async getLesson(lessonId: string): Promise<Lesson | null> {
    const index = await fetchLessonsIndex();
    const entry = index.find((item) => item.id === lessonId || item.slug === lessonId);
    if (!entry) return null;
    const res = await fetch(entry.lessonUrl);
    if (!res.ok) return null;
    return (await res.json()) as Lesson;
  }

  async listLessons(): Promise<LessonSummary[]> {
    // userId игнорируется: индекс сейчас общий на одного пользователя
    // продукта (см. IMPLEMENTATION_DISCOVERY.md — нет auth/userId нигде).
    const index = await fetchLessonsIndex();
    return index.map((entry) => ({
      id: entry.id,
      title: entry.title,
      translatedTitle: entry.translatedTitle,
      level: entry.level,
      estimatedMinutes: entry.estimatedMinutes,
      languageCode: entry.languageCode,
      lessonUrl: entry.lessonUrl,
      audioUrl: entry.audioUrl,
      createdAt: entry.createdAt,
    }));
  }
}
