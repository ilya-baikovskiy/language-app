// LessonBlueprintData -> generateText's InputSource. Deliberately does not
// touch lib/pipeline/generateText.ts (it already has its own English prompt
// template with level/words/language) — this just assembles a content-rich
// topic prompt that generateText's existing `{kind:'topic'}` branch consumes
// as-is.

import type { InputSource } from '../../lib/pipeline/generateText';
import type { LessonBlueprintData } from './types';

function discourseInstruction(discourseType: string, dialogueRatio?: number): string {
  switch (discourseType) {
    case 'dialogue': {
      const ratioNote = dialogueRatio
        ? ` Roughly ${Math.round(dialogueRatio * 100)}% of the text should be direct dialogue.`
        : '';
      return `Include natural back-and-forth dialogue between at least two people.${ratioNote}`;
    }
    case 'narrative':
      return 'Write as a short narrative scene with a small beginning, development and resolution.';
    case 'description':
      return 'Write as a short descriptive piece (a place, a person, a custom) — not a story with a plot.';
    case 'explanation':
      return 'Write as a short factual/explanatory piece — not a story, and not a list of disconnected facts.';
    default:
      return '';
  }
}

export function blueprintToGenerationInput(data: LessonBlueprintData): { input: InputSource; words: number } {
  const outlineHint = data.outline[0] ? ` The idea in more detail (in Russian, translate/adapt it, don't quote it verbatim): "${data.outline[0]}"` : '';

  const parts = [
    `Write a short reading passage about the following idea (originally noted in Russian): "${data.editorialTitleRu}".`,
    outlineHint,
    discourseInstruction(data.learningPassport.discourseType, data.styleConstraints.dialogueRatio),
  ];

  if (data.styleConstraints.avoidSchoolLikeTone) {
    parts.push('Avoid a textbook-moralizing tone — this is not a lesson about good behavior.');
  }
  if (data.styleConstraints.adultAudience) {
    parts.push('Write for an adult learner, not a child — themes and vocabulary should suit an adult reader.');
  }

  const prompt = parts.filter(Boolean).join(' ');

  return {
    input: { kind: 'topic', prompt },
    words: data.styleConstraints.targetWords,
  };
}
