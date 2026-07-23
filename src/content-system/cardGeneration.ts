// Orchestrates card -> Lesson generation on top of the existing synchronous
// client pipeline (generateLessonPipeline.ts) — see
// 11_CLAUDE_MASTER_IMPLEMENTATION_BRIEF.md §PR 3 "Оркестрация генерации по
// карточке". Idempotent: a repeat "Читать" click on the same card/language/
// level either opens the already-ready lesson, or resumes/retries the same
// lessonId instead of creating a duplicate library entry (16 §13).

import { generateLesson, type GenerationProgress } from '../services/generation/generateLessonPipeline';
import type { LanguageCode } from '../../lib/pipeline/languageConfig';
import { buildLessonBlueprint, computeLessonId } from './blueprint';
import { blueprintToGenerationInput } from './blueprintToPrompt';
import { LOCAL_USER_ID } from './userTypes';
import { track } from './analytics/eventClient';
import type { LessonArtifactRepository } from './repositories';
import type { CEFRLevel, ContentCard } from './types';
import type { GenerationStage } from './analyticsEvent';
import type { Lesson } from '../types/lesson';

export async function generateLessonFromCard(
  card: ContentCard,
  language: LanguageCode,
  targetLevel: CEFRLevel,
  lessonArtifactRepository: LessonArtifactRepository,
  onProgress: (progress: GenerationProgress) => void,
): Promise<{ lesson: Lesson; audioUrl: string; lessonId: string }> {
  const lessonId = computeLessonId(card.id, language, targetLevel);

  const summaries = await lessonArtifactRepository.listLessons(LOCAL_USER_ID);
  const existing = summaries.find((s) => s.id === lessonId);

  if (existing && existing.status === 'ready') {
    const lesson = await lessonArtifactRepository.getLesson(lessonId);
    if (lesson) {
      return { lesson, audioUrl: existing.audioUrl, lessonId };
    }
    // Index says 'ready' but the artifact itself is missing/unreachable —
    // fall through and regenerate into the same lessonId rather than fail.
  }

  // No entry, or 'creating'/'failed' — (re)start generation into the same
  // lessonId. This self-heals stuck/failed attempts instead of creating a
  // second library entry for the same card/language/level.
  onProgress({ stage: 'starting' });
  const blueprint = buildLessonBlueprint(card, language, targetLevel);

  // lesson_generation_requested fires here, not earlier — the brief is
  // explicit that this must be "когда реально стартует генерация", not when
  // an existing 'ready' lesson is found and opened without regenerating
  // (see the early return above, which never reaches this point).
  const startedAt = Date.now();
  track(
    'lesson_generation_requested',
    { cardId: card.id, blueprintId: blueprint.id, language, level: targetLevel },
    { cardId: card.id, lessonId, language },
  );

  let currentStage: GenerationStage = 'starting';
  track('lesson_generation_stage_started', { lessonId, stage: currentStage }, { lessonId, cardId: card.id, language });

  await lessonArtifactRepository.startLesson({
    id: lessonId,
    cardId: card.id,
    blueprintId: blueprint.id,
    language,
    level: targetLevel,
    title: card.editorialTitleRu,
    // Rough reading-pace placeholder (~130 words/min) — same order of
    // magnitude as generateText's own estimatedMinutes, not a measurement.
    estimatedMinutes: Math.round(blueprint.data.styleConstraints.targetWords / 130) || 1,
  });

  const { input, words } = blueprintToGenerationInput(blueprint.data);

  try {
    const result = await generateLesson(
      input,
      { level: targetLevel, words, language, lessonId },
      (progress) => {
        // Stage transitions come from generateLessonPipeline.ts's own
        // GenerationProgress callback — each call here is "completed the
        // previous stage, started the next one" (brief §PR 4).
        track('lesson_generation_stage_completed', { lessonId, stage: currentStage }, { lessonId });
        currentStage = progress.stage;
        track('lesson_generation_stage_started', { lessonId, stage: currentStage }, { lessonId });
        onProgress(progress);
      },
    );
    track('lesson_generation_stage_completed', { lessonId, stage: currentStage }, { lessonId });
    track('lesson_generation_completed', { lessonId, durationMs: Date.now() - startedAt }, { lessonId });
    return { ...result, lessonId };
  } catch (err) {
    track(
      'lesson_generation_failed',
      { lessonId, errorMessage: err instanceof Error ? err.message : String(err) },
      { lessonId },
    );
    await lessonArtifactRepository.markLessonFailed(lessonId).catch(() => {
      // Best-effort — if this also fails, the entry stays 'creating' and the
      // next attempt will still overwrite it (startLesson always allowOverwrite).
    });
    throw err;
  }
}
