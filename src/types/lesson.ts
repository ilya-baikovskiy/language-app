export type Lesson = {
  id: string;
  language: string;
  sourceLanguage: string;
  level: string;
  title: string;
  translatedTitle?: string;
  estimatedMinutes: number;
  coverImage?: string;
  paragraphs: Paragraph[];
  annotations: Annotation[];
};

export type Paragraph = {
  id: string;
  sentences: Sentence[];
};

export type Sentence = {
  id: string;
  text: string;
  tokens: Token[];
};

export type Token = {
  id: string;
  text: string;
  normalized: string;
  type: 'word' | 'punctuation';
  sentenceId: string;
  annotationId?: string;
  startTime?: number;
  endTime?: number;
};

export type Annotation = {
  id: string;
  type: 'word' | 'phrase';
  tokenIds: string[];
  displayText: string;
  lemma: string;
  pronunciation?: string;
  partOfSpeech?: string;
  grammarLabel?: string;
  shortTranslation: string;
  contextualMeaning: string;
  constructionExplanation?: string;
  grammarSummary?: string;
  grammarDetails?: string;
  otherMeanings?: Meaning[];
  examples?: Example[];
};

export type Meaning = {
  translation: string;
  note?: string;
};

export type Example = {
  targetText: string;
  translation: string;
};
