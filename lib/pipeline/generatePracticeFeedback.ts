import type { LanguageConfig } from './languageConfig.js';

export type PracticeFeedbackRequest = {
  surfaceForm: string;
  translation: string;
  learnerAnswer: string;
  source: string;
  sourceTranslation?: string;
  verdict: 'almost' | 'again';
  level: string;
};

export type GeneratedPracticeFeedback = {
  explanation: string;
};

const PRACTICE_FEEDBACK_SCHEMA = {
  type: 'object',
  properties: {
    explanation: { type: 'string' },
  },
  required: ['explanation'],
  additionalProperties: false,
};

export async function generatePracticeFeedback(
  request: PracticeFeedbackRequest,
  languageConfig: LanguageConfig,
  apiKey: string,
  model: string,
): Promise<GeneratedPracticeFeedback> {
  const systemPrompt = `You explain one incorrect cloze answer to an adult language learner.
The target language is ${languageConfig.promptLanguageName}; explain in Russian.

Hard rules:
- The product has already assigned the verdict "${request.verdict}". Do not change, debate,
  soften, or re-grade it.
- Compare the learner answer with the exact expected surface form in this exact sentence.
- Name the concrete difference: spelling, accent/diacritic, ending, grammatical form,
  different word, or meaning in context.
- Be constructive and specific. Never shame the learner.
- Use 1-2 short sentences, maximum 45 words.
- Do not add exercises, alternatives, markdown, labels, scores, or scheduling advice.
- Output only the JSON object required by the schema.`;

  const userPrompt = `Learner level: ${request.level}
Expected exact form: "${request.surfaceForm}"
Contextual Russian gloss: "${request.translation}"
Learner answer: "${request.learnerAnswer}"
Target-language sentence: "${request.source}"
Russian sentence: "${request.sourceTranslation ?? '(not available)'}"`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'practice_feedback',
          strict: true,
          schema: PRACTICE_FEEDBACK_SCHEMA,
        },
      },
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI error ${response.status}: ${await response.text()}`);
  }

  const json = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const result = JSON.parse(json.choices[0]?.message.content ?? '{}') as GeneratedPracticeFeedback;
  const explanation = result.explanation?.trim();
  if (!explanation) throw new Error('Practice feedback has no explanation');
  return { explanation };
}
