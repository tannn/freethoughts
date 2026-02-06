const WORD_RE = /[\p{L}\p{N}]+/gu;

export const tokenizeUnicodeWords = (text: string): string[] => {
  return text.match(WORD_RE) ?? [];
};

export const countUnicodeWords = (text: string): number => {
  return tokenizeUnicodeWords(text).length;
};
