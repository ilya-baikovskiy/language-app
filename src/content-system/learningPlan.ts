// Hidden Learning Plan contracts — см. docs/content-system-v1.2/03.
//
// Только типы. По 11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md §Repository contracts
// `LearningStateRepository` вводится в Phase 6, не в PR 1 — здесь фиксируем
// форму данных заранее (ContentCard.learningNodeIds на неё уже ссылается),
// но никакой adapter/repository для неё пока нет.

import type { CEFRLevel } from './types';

export type LearningNodeCategory = 'communicative' | 'lexical' | 'grammar' | 'discourse' | 'reading_skill';

export type LearningNode = {
  id: string;
  language: string;
  category: LearningNodeCategory;
  code: string;
  title: string;
  description: string;
  introducedAt: CEFRLevel;
  expectedComfortAt?: CEFRLevel;
  prerequisites: string[];
  relatedNodeIds: string[];
  mandatoryWeight: number;
  defaultPriority: number;
  examples?: string[];
  active: boolean;
};

export type UserLearningNodeState = {
  userId: string;
  language: string;
  nodeId: string;

  exposureCount: number;
  completedLessonCount: number;
  recentExposureCount: number;

  difficultyEvidence: number;
  comfortEvidence: number;
  interestEvidence: number;

  coverageScore: number;
  comfortScore: number;
  confidence: number;

  lastExposedAt?: string;
  lastSuccessfulAt?: string;
  updatedAt: string;
};
