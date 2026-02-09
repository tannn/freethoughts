export const trimExcerpt = (text: string, maxLength: number): string =>
  text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3))}...` : text;
