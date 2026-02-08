import { describe, expect, it } from 'vitest';
import { buildAnchors, normalizeHeadingSlug } from '../src/ingestion/anchors.js';
import {
  DOCUMENT_WORD_LIMIT,
  countMarkdownWords,
  countTxtWords,
  isWithinWordLimit,
  markdownToPlainText
} from '../src/ingestion/wordCount.js';

describe('anchor and word-count determinism', () => {
  it('normalizes heading slugs per requirements and applies ordinal collisions', () => {
    expect(normalizeHeadingSlug('  Crème Brûlée & Résumé  ')).toBe('creme-brulee-resume');
    expect(normalizeHeadingSlug('@@@')).toBe('section');

    const anchors = buildAnchors([
      { heading: 'Intro' },
      { heading: 'Intro' },
      { heading: 'INTRO' },
      { heading: 'Crème Brûlée' }
    ]);

    expect(anchors).toEqual(['intro#1', 'intro#2', 'intro#3', 'creme-brulee#1']);
  });

  it('counts markdown words using plain text with syntax and code fences removed', () => {
    const markdown = [
      '# Header',
      '',
      'Some **bold** words and a [link text](https://example.com).',
      '',
      '```ts',
      'const hidden = 1;',
      '```',
      '',
      '- item one',
      '- item two',
      '',
      'Inline `code` stays removed.'
    ].join('\n');

    const plain = markdownToPlainText(markdown);
    expect(plain).not.toContain('const hidden = 1;');
    expect(plain).not.toContain('```');

    // Header Some bold words and a link text item one item two Inline code stays removed
    expect(countMarkdownWords(markdown)).toBe(16);
  });

  it('enforces deterministic 25,000-word limit for txt and md', () => {
    const txtWithin = Array.from({ length: DOCUMENT_WORD_LIMIT }, (_, i) => `w${i + 1}`).join(' ');
    const txtOver = `${txtWithin} extra`;

    expect(countTxtWords(txtWithin)).toBe(DOCUMENT_WORD_LIMIT);
    expect(isWithinWordLimit(countTxtWords(txtWithin))).toBe(true);
    expect(countTxtWords(txtOver)).toBe(DOCUMENT_WORD_LIMIT + 1);
    expect(isWithinWordLimit(countTxtWords(txtOver))).toBe(false);

    const markdownExactLimit = txtWithin;
    expect(countMarkdownWords(markdownExactLimit)).toBe(DOCUMENT_WORD_LIMIT);
    expect(isWithinWordLimit(countMarkdownWords(markdownExactLimit))).toBe(true);

    const markdownWithin = `${'# H\n\n'}${txtWithin}`;
    const markdownOver = `${'# H\n\n'}${txtOver}`;

    expect(countMarkdownWords(markdownWithin)).toBe(DOCUMENT_WORD_LIMIT + 1);
    expect(isWithinWordLimit(countMarkdownWords(markdownWithin))).toBe(false);
    expect(countMarkdownWords(markdownOver)).toBe(DOCUMENT_WORD_LIMIT + 2);
    expect(isWithinWordLimit(countMarkdownWords(markdownOver))).toBe(false);
  });
});
