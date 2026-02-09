export const trimExcerpt = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }

  if (maxLength <= 3) {
    return text.slice(0, maxLength);
  }

  const trimLength = maxLength - 3;
  return `${text.slice(0, trimLength)}...`;
};
