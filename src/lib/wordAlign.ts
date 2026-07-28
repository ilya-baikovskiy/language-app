const WORD_CHAR = /[\p{L}\p{N}]/u;

// Ищет needle внутри haystack по границе слова (без учёта регистра) — первое
// вхождение, где символы до/после совпадения не являются буквой/цифрой, то
// есть не часть более длинного слова. Общее для ExplanationSheet (подсветка
// «В контексте») и экрана тренировки (сборка фразы с пропуском).
export function findWordAlignedIndex(haystack: string, needle: string): number {
  if (!needle) return -1;
  const lowerHaystack = haystack.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let from = 0;
  for (;;) {
    const idx = lowerHaystack.indexOf(lowerNeedle, from);
    if (idx === -1) return -1;
    const before = idx > 0 ? lowerHaystack[idx - 1] : '';
    const after = lowerHaystack[idx + lowerNeedle.length] ?? '';
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return idx;
    from = idx + 1;
  }
}
