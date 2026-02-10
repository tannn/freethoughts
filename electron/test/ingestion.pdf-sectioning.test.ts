import { describe, expect, it } from 'vitest';
import { sectionPdf } from '../src/ingestion/sectioning/pdf.js';

describe('deterministic .pdf sectioning', () => {
  it('preserves content before the first outline item as a leading section', () => {
    const sections = sectionPdf({
      pages: [
        { pageNumber: 1, text: 'preface text' },
        { pageNumber: 2, text: 'intro page' },
        { pageNumber: 3, text: 'method page' }
      ],
      outline: [
        { title: 'Intro', pageNumber: 2 },
        { title: 'Method', pageNumber: 3 }
      ]
    });

    expect(sections).toEqual([
      { heading: 'Document', content: 'preface text', startPage: 1, endPage: 1 },
      { heading: 'Intro', content: 'intro page', startPage: 2, endPage: 2 },
      { heading: 'Method', content: 'method page', startPage: 3, endPage: 3 }
    ]);
  });

  it('uses outline/bookmarks when present', () => {
    const sections = sectionPdf({
      pages: [
        { pageNumber: 1, text: 'p1' },
        { pageNumber: 2, text: 'p2' },
        { pageNumber: 3, text: 'p3' },
        { pageNumber: 4, text: 'p4' }
      ],
      outline: [
        { title: 'Intro', pageNumber: 1 },
        { title: 'Method', pageNumber: 3 }
      ]
    });

    expect(sections).toEqual([
      { heading: 'Intro', content: 'p1\n\np2', startPage: 1, endPage: 2 },
      { heading: 'Method', content: 'p3\n\np4', startPage: 3, endPage: 4 }
    ]);
  });

  it('falls back to heading-like line detection when outline is absent', () => {
    const sections = sectionPdf({
      pages: [
        {
          pageNumber: 1,
          text: ['1 Introduction', 'alpha', 'beta', '', 'KEY RESULTS', 'gamma'].join('\n')
        },
        {
          pageNumber: 2,
          text: ['Title Label:', 'delta'].join('\n')
        }
      ]
    });

    expect(sections.map((s) => s.heading)).toEqual(['1 Introduction', 'KEY RESULTS', 'Title Label:']);
    expect(sections.map((s) => s.content)).toEqual(['alpha\nbeta', 'gamma', 'delta']);
  });

  it('preserves content before the first detected heading as a leading section', () => {
    const sections = sectionPdf({
      pages: [
        {
          pageNumber: 1,
          text: ['Preface paragraph.', '', '1 Introduction', 'alpha'].join('\n')
        }
      ]
    });

    expect(sections).toEqual([
      {
        heading: 'Document',
        content: 'Preface paragraph.',
        startPage: 1,
        endPage: 1
      },
      {
        heading: '1 Introduction',
        content: 'alpha',
        startPage: 1,
        endPage: 1
      }
    ]);
  });

  it('falls back to deterministic 2-page buckets when no headings are found', () => {
    const first = sectionPdf({
      pages: [
        { pageNumber: 1, text: 'alpha' },
        { pageNumber: 2, text: 'beta' },
        { pageNumber: 3, text: 'gamma' }
      ]
    });

    const second = sectionPdf({
      pages: [
        { pageNumber: 1, text: 'alpha' },
        { pageNumber: 2, text: 'beta' },
        { pageNumber: 3, text: 'gamma' }
      ]
    });

    expect(first).toEqual(second);
    expect(first).toEqual([
      { heading: 'Pages 1-2', content: 'alpha\n\nbeta', startPage: 1, endPage: 2 },
      { heading: 'Pages 3-3', content: 'gamma', startPage: 3, endPage: 3 }
    ]);
  });

  it('keeps empty-text pages in deterministic 2-page bucket boundaries', () => {
    const sections = sectionPdf({
      pages: [
        { pageNumber: 1, text: 'alpha' },
        { pageNumber: 2, text: '' },
        { pageNumber: 3, text: '' },
        { pageNumber: 4, text: 'beta' }
      ]
    });

    expect(sections).toEqual([
      { heading: 'Pages 1-2', content: 'alpha', startPage: 1, endPage: 2 },
      { heading: 'Pages 3-4', content: 'beta', startPage: 3, endPage: 4 }
    ]);
  });
});
