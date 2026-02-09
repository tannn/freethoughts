export const trimExcerpt = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }

  const trimLength = Math.max(0, maxLength - 3);
  return `${text.slice(0, trimLength)}...`;
};
