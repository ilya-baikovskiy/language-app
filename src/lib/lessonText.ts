import type { AnnotationTarget } from '../../lib/pipeline/generateAnnotations';
import type { Lesson } from '../types/lesson';

export type TokenSpan = { tokenId: string; start: number; end: number };

// Строит цельный текст урока и диапазон символов каждого токена в нём —
// нужно, чтобы озвучивать "с этого слова и до конца" и обратно сопоставлять
// boundary-события синтезатора с конкретным токеном.
//
// Текст — это настоящий sentence.text (не пересборка из токенов по
// эвристике "пробел перед каждым словом, кроме пунктуации"): для ручного
// sample-урока текст и токены согласованы вручную, и эвристика случайно
// давала тот же результат, но для AI-сгенерированного текста реальные
// пробелы вокруг кавычек/цифр/двоеточий не обязаны следовать этому правилу
// (см. tokenize.ts — цифры токенизируются как "пунктуация", не "слово").
// Расхождение накапливалось по ходу урока и ломало поиск текста в
// speakSelection (PrecomputedAudioAdapter) — сильнее к концу урока.
// Позиция каждого токена ищется последовательным indexOf с продвигающимся
// курсором внутри sentence.text — токены получены той же строкой, что и
// текст, поэтому их подстроки всегда точно находятся, включая повторы.
export function buildLessonText(lesson: Lesson): { text: string; spans: TokenSpan[] } {
  let text = '';
  const spans: TokenSpan[] = [];

  lesson.paragraphs.forEach((paragraph, pIndex) => {
    if (pIndex > 0) text += '\n\n';
    paragraph.sentences.forEach((sentence, sIndex) => {
      if (sIndex > 0) text += ' ';
      const sentenceStart = text.length;
      text += sentence.text;

      let cursor = 0;
      sentence.tokens.forEach((token) => {
        const relIdx = sentence.text.indexOf(token.text, cursor);
        const start = sentenceStart + (relIdx === -1 ? cursor : relIdx);
        const end = start + token.text.length;
        spans.push({ tokenId: token.id, start, end });
        if (relIdx !== -1) cursor = relIdx + token.text.length;
      });
    });
  });

  return { text, spans };
}

export function findTokenAtOffset(spans: TokenSpan[], offset: number): TokenSpan | undefined {
  return spans.find((s) => offset >= s.start && offset < s.end) ?? spans.find((s) => s.start >= offset);
}

// Текст одного токена по id — для прогрева клипа произношения сразу при
// выборе слова (useUnitPronunciation.prefetch в ReaderPage), раньше, чем
// придёт ответ AI-объяснения (см. resolveAnnotationTarget — тот же паттерн
// для фраз, эта функция — для одиночного токена, когда annotationId ещё нет).
export function findTokenText(lesson: Lesson, tokenId: string): string | null {
  for (const paragraph of lesson.paragraphs) {
    for (const sentence of paragraph.sentences) {
      const token = sentence.tokens.find((t) => t.id === tokenId);
      if (token) return token.text;
    }
  }
  return null;
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

// Восстанавливает AnnotationTarget по одному annotationId — нужно для ленивой
// подгрузки контента объяснения (useSelectedAnnotation.ts): на этапе
// генерации токены уже помечены annotationId (stampAnnotationTargets в
// lib/pipeline/generateAnnotations.ts), а сама цель для запроса
// /api/generate-annotation восстанавливается прямо из сохранённого урока —
// отдельно её нигде хранить не нужно. По построению все токены с одним
// annotationId соседние и лежат в одном предложении.
export function resolveAnnotationTarget(lesson: Lesson, annotationId: string): AnnotationTarget | null {
  for (const paragraph of lesson.paragraphs) {
    for (const sentence of paragraph.sentences) {
      const tokens = sentence.tokens.filter((token) => token.annotationId === annotationId);
      if (tokens.length === 0) continue;
      return {
        tokenIds: tokens.map((token) => token.id),
        displayText: tokens.map((token) => token.text).join(' '),
        sentenceText: sentence.text,
        type: tokens.length > 1 ? 'phrase' : 'word',
      };
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
