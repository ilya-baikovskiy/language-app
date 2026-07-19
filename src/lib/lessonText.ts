import type { Lesson } from '../types/lesson';

export type TokenSpan = { tokenId: string; start: number; end: number };

// Строит цельный текст урока и диапазон символов каждого токена в нём —
// нужно, чтобы озвучивать "с этого слова и до конца" и обратно сопоставлять
// boundary-события синтезатора с конкретным токеном. Пробелы расставляются
// по тем же правилам, что и в InteractiveSentence (иначе разметка слов и
// текст для TTS разойдутся).
export function buildLessonText(lesson: Lesson): { text: string; spans: TokenSpan[] } {
  let text = '';
  const spans: TokenSpan[] = [];

  lesson.paragraphs.forEach((paragraph, pIndex) => {
    if (pIndex > 0) text += '\n\n';
    paragraph.sentences.forEach((sentence, sIndex) => {
      if (sIndex > 0) text += ' ';
      sentence.tokens.forEach((token, tIndex) => {
        const isPunctuation = token.type === 'punctuation';
        if (tIndex > 0 && !isPunctuation) text += ' ';
        const start = text.length;
        text += token.text;
        spans.push({ tokenId: token.id, start, end: text.length });
      });
    });
  });

  return { text, spans };
}

export function findTokenAtOffset(spans: TokenSpan[], offset: number): TokenSpan | undefined {
  return spans.find((s) => offset >= s.start && offset < s.end) ?? spans.find((s) => s.start >= offset);
}

export function firstWordTokenId(lesson: Lesson): string | null {
  for (const paragraph of lesson.paragraphs) {
    for (const sentence of paragraph.sentences) {
      for (const token of sentence.tokens) {
        if (token.type === 'word') return token.id;
      }
    }
  }
  return null;
}

export function orderedWordTokenIds(lesson: Lesson): string[] {
  const ids: string[] = [];
  for (const paragraph of lesson.paragraphs) {
    for (const sentence of paragraph.sentences) {
      for (const token of sentence.tokens) {
        if (token.type === 'word') ids.push(token.id);
      }
    }
  }
  return ids;
}
