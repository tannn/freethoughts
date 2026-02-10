import { trimExcerpt } from './text.js';

export const formatNoteAnchorExcerpt = (
  selectedTextExcerpt: string | null,
  maxLength = 80
): string | null => {
  if (!selectedTextExcerpt) {
    return null;
  }

  return `"${trimExcerpt(selectedTextExcerpt, maxLength)}"`;
};
