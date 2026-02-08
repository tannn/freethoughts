import { countUnicodeWords } from './tokenize.js';

export const DOCUMENT_WORD_LIMIT = 25_000;

const stripFencedCodeBlocks = (markdown: string): string => {
  return markdown.replace(/```[\s\S]*?```/g, ' ').replace(/~~~[\s\S]*?~~~/g, ' ');
};

const stripInlineCode = (markdown: string): string => {
  // Keep inline code text while removing markdown delimiters.
  return markdown.replace(/`([^`]*)`/g, '$1');
};

const stripMarkdownSyntax = (markdown: string): string => {
  return markdown
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6})\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}(\*|-|\+)\s+/gm, '')
    .replace(/^\s{0,3}\d+\.\s+/gm, '')
    .replace(/\*\*|__|\*|_|~~/g, ' ')
    .replace(/<[^>]+>/g, ' ');
};

export const markdownToPlainText = (markdown: string): string => {
  const withoutFences = stripFencedCodeBlocks(markdown);
  const withoutInlineCode = stripInlineCode(withoutFences);
  return stripMarkdownSyntax(withoutInlineCode);
};

export const countTxtWords = (text: string): number => {
  return countUnicodeWords(text);
};

export const countMarkdownWords = (markdown: string): number => {
  return countUnicodeWords(markdownToPlainText(markdown));
};

export const isWithinWordLimit = (wordCount: number): boolean => {
  return wordCount <= DOCUMENT_WORD_LIMIT;
};
