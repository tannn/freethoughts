import { describe, expect, it } from 'vitest';
import { countUnicodeWords } from '../src/ingestion/tokenize.js';
import { sectionMarkdown, sectionTxt } from '../src/ingestion/sectioning/mdTxt.js';

describe('deterministic .md/.txt sectioning', () => {
  it('sections markdown by ATX and setext headings deterministically', () => {
    const source = [
      'Preface paragraph.',
      '',
      '# First Heading',
      'alpha',
      'beta',
      '',
      'Second Heading',
      '---',
      'gamma'
    ].join('\n');

    const first = sectionMarkdown(source);
    const second = sectionMarkdown(source);

    expect(first).toEqual(second);
    expect(first.map((s) => s.heading)).toEqual(['Document', 'First Heading', 'Second Heading']);
    expect(first.map((s) => s.content)).toEqual(['Preface paragraph.', 'alpha\nbeta', 'gamma']);
  });

  it('sections txt by heading-like lines (numbered/all-caps/title-style)', () => {
    const source = [
      '1 Introduction',
      'alpha',
      '',
      'KEY RESULTS',
      'beta',
      '',
      'Title Case Label:',
      'gamma'
    ].join('\n');

    const sections = sectionTxt(source);

    expect(sections.map((s) => s.heading)).toEqual([
      '1 Introduction',
      'KEY RESULTS',
      'Title Case Label:'
    ]);
    expect(sections.map((s) => s.content)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('falls back to deterministic ~900-word paragraph buckets when no txt headings exist', () => {
    const paragraph1 = Array.from({ length: 500 }, (_, i) => `p1w${i + 1}`).join(' ');
    const paragraph2 = Array.from({ length: 500 }, (_, i) => `p2w${i + 1}`).join(' ');
    const paragraph3 = Array.from({ length: 500 }, (_, i) => `p3w${i + 1}`).join(' ');

    const source = [paragraph1, '', paragraph2, '', paragraph3].join('\n');
    const first = sectionTxt(source);
    const second = sectionTxt(source);

    expect(first).toEqual(second);

    const counts = first.map((section) => countUnicodeWords(section.content));
    expect(counts).toEqual([500, 500, 500]);

    const totalWords = first.reduce((acc, section) => acc + countUnicodeWords(section.content), 0);
    expect(totalWords).toBe(1500);
  });
});
