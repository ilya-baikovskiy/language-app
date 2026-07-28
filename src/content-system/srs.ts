import type { ReviewState, SavedWord } from './savedWord';

export type ReviewVerdict = 'good' | 'almost' | 'again';

const MIN_EASE_FACTOR = 1.3;
const NEW_WORDS_PER_SESSION = 10;

function normalizeAnswer(value: string): string {
  return value.normalize('NFC').trim().toLocaleLowerCase();
}

function normalizeForDistance(value: string): string {
  return normalizeAnswer(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function levenshteinDistance(left: string, right: string): number {
  const a = Array.from(left);
  const b = Array.from(right);
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return previous[b.length];
}

function commonPrefixLength(left: string, right: string): number {
  const a = Array.from(left);
  const b = Array.from(right);
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) length++;
  return length;
}

// Клоуз проверяет одну сохранённую словоформу. Точное совпадение — «Верно»;
// небольшая правка в окончании/диакритике при общем корне — «Почти»;
// пустой или другой лексический ответ — «Не совсем».
export function classifyReviewAnswer(input: string, expected: string, hintUsed: boolean): ReviewVerdict {
  if (hintUsed) return 'again';
  if (normalizeAnswer(input) === normalizeAnswer(expected)) return 'good';

  const actual = normalizeForDistance(input);
  const target = normalizeForDistance(expected);
  if (!actual || !target) return 'again';

  const distance = levenshteinDistance(actual, target);
  const maxDistance = Math.max(1, Math.floor(Array.from(target).length * 0.3));
  const requiredPrefix = Math.min(3, Math.max(1, Array.from(target).length - 1));
  const sameLexicalBase = commonPrefixLength(actual, target) >= requiredPrefix;
  return distance <= maxDistance && sameLexicalBase ? 'almost' : 'again';
}

function addDays(now: Date, days: number): string {
  const due = new Date(now);
  due.setUTCDate(due.getUTCDate() + days);
  return due.toISOString();
}

export function scheduleNext(
  previous: ReviewState,
  verdict: ReviewVerdict,
  now: Date = new Date(),
): ReviewState {
  if (verdict === 'again') {
    const intervalDays = 1;
    return {
      easeFactor: Math.max(MIN_EASE_FACTOR, Number((previous.easeFactor - 0.2).toFixed(2))),
      intervalDays,
      repetitions: 0,
      dueAt: addDays(now, intervalDays),
      lastReviewedAt: now.toISOString(),
      lapses: previous.lapses + 1,
    };
  }

  const repetitions = previous.repetitions + 1;
  const easeDelta = verdict === 'good' ? 0.1 : -0.15;
  const easeFactor = Math.max(MIN_EASE_FACTOR, Number((previous.easeFactor + easeDelta).toFixed(2)));
  const intervalDays =
    repetitions === 1
      ? 1
      : repetitions === 2
        ? 6
        : Math.max(1, Math.round(previous.intervalDays * easeFactor));

  return {
    easeFactor,
    intervalDays,
    repetitions,
    dueAt: addDays(now, intervalDays),
    lastReviewedAt: now.toISOString(),
    lapses: previous.lapses,
  };
}

function isNewWord(word: SavedWord): boolean {
  return !word.review.lastReviewedAt && word.review.repetitions === 0 && word.review.intervalDays === 0;
}

// Все уже изучавшиеся due-слова идут в сессию без лимита. Новых — максимум
// десять; порядок стабилен по dueAt/createdAt и замораживается при «Начать».
export function selectPracticeQueue(
  words: SavedWord[],
  now: Date = new Date(),
  newWordLimit: number = NEW_WORDS_PER_SESSION,
): SavedWord[] {
  const due = words.filter((word) => new Date(word.review.dueAt).getTime() <= now.getTime());
  const reviews = due
    .filter((word) => !isNewWord(word))
    .sort((a, b) => a.review.dueAt.localeCompare(b.review.dueAt));
  const newWords = due
    .filter(isNewWord)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, newWordLimit);
  return [...reviews, ...newWords];
}

