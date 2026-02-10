import { countUnicodeWords, tokenizeUnicodeWords } from '../tokenize.js';

export interface ParsedSection {
  heading: string;
  content: string;
  startLine: number;
}

const TITLE_STYLE_RE = /^[A-Za-z][A-Za-z0-9 /&()'\\-]{1,80}:$/;
const NUMBERED_HEADING_RE = /^\d+(\.\d+)*\s+\S+/;
const ATX_HEADING_RE = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/;
const SETEXT_UNDERLINE_RE = /^\s*(=+|-+)\s*$/;
const FALLBACK_CHUNK_WORD_TARGET = 900;

interface Boundary {
  heading: string;
  startLine: number;
  contentStartLine: number;
}

const normalizeHeading = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.length === 0 ? 'Section' : trimmed;
};

const isShortAllCapsHeading = (line: string): boolean => {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 80) {
    return false;
  }

  if (/[.?!]$/.test(trimmed)) {
    return false;
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return false;
  }

  const letters = [...trimmed].filter((char) => /\p{L}/u.test(char));
  if (letters.length === 0) {
    return false;
  }

  const uppercaseLetters = letters.filter((char) => char === char.toUpperCase());
  const uppercaseRatio = uppercaseLetters.length / letters.length;
  return uppercaseRatio >= 0.8;
};

export const isTxtHeadingLikeLine = (line: string): boolean => {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  return (
    NUMBERED_HEADING_RE.test(trimmed) ||
    isShortAllCapsHeading(trimmed) ||
    TITLE_STYLE_RE.test(trimmed)
  );
};

const markdownBoundaries = (source: string): Boundary[] => {
  const lines = source.split(/\r?\n/);
  const boundaries: Boundary[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const atx = line.match(ATX_HEADING_RE);
    if (atx) {
      boundaries.push({
        heading: normalizeHeading(atx[1] ?? 'Section'),
        startLine: i,
        contentStartLine: i + 1
      });
      continue;
    }

    const nextLine = lines[i + 1] ?? '';
    if (line.trim() && SETEXT_UNDERLINE_RE.test(nextLine)) {
      boundaries.push({
        heading: normalizeHeading(line),
        startLine: i,
        contentStartLine: i + 2
      });
      i += 1;
    }
  }

  return boundaries;
};

export const sectionMarkdown = (source: string): ParsedSection[] => {
  const lines = source.split(/\r?\n/);
  const boundaries = markdownBoundaries(source);

  if (boundaries.length === 0) {
    return [
      {
        heading: 'Document',
        content: source.trim(),
        startLine: 0
      }
    ];
  }

  const sections: ParsedSection[] = [];

  if (boundaries[0]?.startLine && boundaries[0].startLine > 0) {
    sections.push({
      heading: 'Document',
      content: lines.slice(0, boundaries[0].startLine).join('\n').trim(),
      startLine: 0
    });
  }

  for (let i = 0; i < boundaries.length; i += 1) {
    const current = boundaries[i];
    const next = boundaries[i + 1];
    const contentLines = lines.slice(current.contentStartLine, next ? next.startLine : lines.length);
    sections.push({
      heading: current.heading,
      content: contentLines.join('\n').trim(),
      startLine: current.startLine
    });
  }

  return sections.filter((section) => section.heading || section.content);
};

const splitParagraphByWordBudget = (paragraph: string, maxWords: number): string[] => {
  const words = tokenizeUnicodeWords(paragraph);
  if (words.length <= maxWords) {
    return [paragraph.trim()];
  }

  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(' '));
  }

  return chunks;
};

const paragraphFallbackSections = (source: string): ParsedSection[] => {
  const paragraphs = source
    .split(/\n\s*\n/g)
    .map((part) => part.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return [{ heading: 'Section 1', content: '', startLine: 0 }];
  }

  const deterministicParagraphs = paragraphs.flatMap((paragraph) =>
    splitParagraphByWordBudget(paragraph, FALLBACK_CHUNK_WORD_TARGET)
  );

  const sections: ParsedSection[] = [];
  let currentParagraphs: string[] = [];
  let currentWordCount = 0;

  const flush = (): void => {
    if (currentParagraphs.length === 0) {
      return;
    }

    sections.push({
      heading: `Section ${sections.length + 1}`,
      content: currentParagraphs.join('\n\n').trim(),
      startLine: 0
    });
    currentParagraphs = [];
    currentWordCount = 0;
  };

  for (const paragraph of deterministicParagraphs) {
    const paragraphWordCount = countUnicodeWords(paragraph);
    if (currentWordCount > 0 && currentWordCount + paragraphWordCount > FALLBACK_CHUNK_WORD_TARGET) {
      flush();
    }

    currentParagraphs.push(paragraph);
    currentWordCount += paragraphWordCount;
  }

  flush();

  return sections;
};

export const sectionTxt = (source: string): ParsedSection[] => {
  const lines = source.split(/\r?\n/);
  const headingBoundaries: Boundary[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (!isTxtHeadingLikeLine(line)) {
      continue;
    }

    headingBoundaries.push({
      heading: normalizeHeading(line),
      startLine: i,
      contentStartLine: i + 1
    });
  }

  if (headingBoundaries.length === 0) {
    return paragraphFallbackSections(source);
  }

  const sections: ParsedSection[] = [];
  if (headingBoundaries[0]?.startLine && headingBoundaries[0].startLine > 0) {
    sections.push({
      heading: 'Document',
      content: lines.slice(0, headingBoundaries[0].startLine).join('\n').trim(),
      startLine: 0
    });
  }

  for (let i = 0; i < headingBoundaries.length; i += 1) {
    const current = headingBoundaries[i];
    const next = headingBoundaries[i + 1];
    const contentLines = lines.slice(current.contentStartLine, next ? next.startLine : lines.length);

    sections.push({
      heading: current.heading,
      content: contentLines.join('\n').trim(),
      startLine: current.startLine
    });
  }

  return sections.filter((section) => section.heading || section.content);
};
