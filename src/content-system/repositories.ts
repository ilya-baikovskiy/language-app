// Repository interfaces — см. docs/content-system-v1.2/06 §2 и
// 11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md §Repository contracts.
//
// Главное правило проекта для этой подсистемы: UI и domain-код не должны
// напрямую импортировать @vercel/blob, localStorage или любой storage SDK —
// только эти интерфейсы. Конкретные adapters — в ./repositories/*.
//
// GenerationJobRepository сюда намеренно не входит: текущая генерация урока
// синхронная и уже показывает стадии через progress callback (см.
// generateLessonPipeline.ts / IMPLEMENTATION_DISCOVERY.md) — по 06 §3.4
// persistent job system не нужен, пока не появится восстановление после
// закрытия страницы или background generation. LearningStateRepository тоже
// не входит: по брифу вводится в Phase 6.

import type { Lesson } from '../types/lesson';
import type { AppPreferences, LanguageProfile } from './userTypes';
import type { AnalyticsEvent } from './analyticsEvent';
import type { CEFRLevel, ContentCard, FeedBatch, LessonArtifactRef, LessonSummary } from './types';

export type CardCandidateQuery = {
  language?: string;
  level?: CEFRLevel;
  topicIds?: string[];
  countryOrRegionIds?: string[];
  excludeCardIds?: string[];
};

export interface AppPreferencesRepository {
  get(userId: string): Promise<AppPreferences | null>;
  upsert(preferences: AppPreferences): Promise<AppPreferences>;
}

export interface LanguageProfileRepository {
  getByUser(userId: string): Promise<LanguageProfile[]>;
  get(userId: string, language: string): Promise<LanguageProfile | null>;
  upsert(profile: LanguageProfile): Promise<LanguageProfile>;
}

export interface ContentCardRepository {
  // ContentCard — canonical, языко-независимая идея (см. types.ts).
  listCandidates(query: CardCandidateQuery): Promise<ContentCard[]>;
  getById(cardId: string): Promise<ContentCard | null>;
  saveMany(cards: ContentCard[]): Promise<void>;
}

export interface FeedRepository {
  getLatest(userId: string, language: string): Promise<FeedBatch | null>;
  save(batch: FeedBatch): Promise<void>;
}

export interface AnalyticsEventRepository {
  appendBatch(events: AnalyticsEvent[]): Promise<{ acceptedCount: number; duplicateCount: number }>;
}

export interface LessonArtifactRepository {
  // Расходится с буквальной сигнатурой из 06 §2 (`saveLesson(lesson)`):
  // существующий пайплайн сохраняет audioUrl отдельно от Lesson (аудио — не
  // поле Lesson, см. IMPLEMENTATION_DISCOVERY.md), поэтому adapter обязан
  // принимать оба аргумента. Минимальное совместимое отклонение, а не смена
  // архитектуры — см. 11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md §«Работа с расхождениями».
  saveLesson(lesson: Lesson, audioUrl: string): Promise<LessonArtifactRef>;
  getLesson(lessonId: string): Promise<Lesson | null>;
  listLessons(userId: string): Promise<LessonSummary[]>;
}
