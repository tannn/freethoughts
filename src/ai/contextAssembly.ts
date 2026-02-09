import { tokenizeUnicodeWords } from '../ingestion/tokenize.js';
import { AppError } from '../shared/ipc/errors.js';
import { DEFAULT_INPUT_TOKEN_BUDGET } from './types.js';

export interface ContextSection {
  id: string;
  heading: string;
  content: string;
  orderIndex: number;
}

export interface DeterministicContextAssemblyResult {
  text: string;
  includedSectionIds: string[];
  estimatedInputTokens: number;
}

const trimToWordBudget = (text: string, maxWords: number): string => {
  if (maxWords <= 0) {
    return '';
  }

  const words = tokenizeUnicodeWords(text);
  if (words.length <= maxWords) {
    return text;
  }

  return words.slice(0, maxWords).join(' ');
};

const estimateTokenCount = (text: string): number => tokenizeUnicodeWords(text).length;

const formatSectionBlock = (label: string, section: ContextSection): string => {
  return `[${label}] ${section.heading}\n${section.content}`.trim();
};

export const buildDeterministicProvocationContext = (
  sections: ContextSection[],
  activeSectionId: string,
  inputTokenBudget = DEFAULT_INPUT_TOKEN_BUDGET
): DeterministicContextAssemblyResult => {
  const orderedSections = [...sections].sort((a, b) => a.orderIndex - b.orderIndex);
  const activeIndex = orderedSections.findIndex((section) => section.id === activeSectionId);

  if (activeIndex < 0) {
    throw new AppError('E_NOT_FOUND', 'Active section not found for context assembly', {
      activeSectionId
    });
  }

  const active = orderedSections[activeIndex];
  const candidates = [{ label: 'Active', section: active }];

  let remaining = inputTokenBudget;
  const blocks: string[] = [];
  const includedSectionIds: string[] = [];

  for (const candidate of candidates) {
    if (remaining <= 0) {
      break;
    }

    const block = formatSectionBlock(candidate.label, candidate.section);
    const blockTokens = estimateTokenCount(block);

    if (blockTokens <= remaining) {
      blocks.push(block);
      includedSectionIds.push(candidate.section.id);
      remaining -= blockTokens;
      continue;
    }

    const clipped = trimToWordBudget(block, remaining).trim();
    if (clipped.length > 0) {
      blocks.push(clipped);
      includedSectionIds.push(candidate.section.id);
      remaining = 0;
    }
  }

  const text = blocks.join('\n\n---\n\n').trim();

  return {
    text,
    includedSectionIds,
    estimatedInputTokens: estimateTokenCount(text)
  };
};
