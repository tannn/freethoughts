import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appTsPath = join(__dirname, '..', 'src', 'renderer', 'app.ts');

describe('renderer pdf selection mapping', () => {
  it('maps native pdf selections to deterministic offsets before note.create', () => {
    const appTs = readFileSync(appTsPath, 'utf8');

    expect(appTs).toContain('mapPdfSelectionAnchorToOffsets');
    expect(appTs).toContain('candidateNeedles');
    expect(appTs).toContain('suffixOverlapLength');
    expect(appTs).toContain('prefixOverlapLength');
    expect(appTs).toContain('buildSectionOffsetMap');
    expect(appTs).toContain('normalizedOffsetToOriginalOffset');
    expect(appTs).toContain('const mappedStartNorm = bestMatch.start + leadingTrim');
    expect(appTs).toContain('const mappedStart = normalizedOffsetToOriginalOffset(sectionOffsetMap.offsets, mappedStartNorm)');
    expect(appTs).toContain('countParagraphOrdinal(normalizedSection, mappedStartNorm)');
    expect(appTs).toContain('paragraphOrdinal: selection.paragraphOrdinal');
    expect(appTs).toContain('startOffset: selection.startOffset');
    expect(appTs).toContain('endOffset: selection.endOffset');
  });

  it('surfaces recoverable guidance when deterministic mapping fails', () => {
    const appTs = readFileSync(appTsPath, 'utf8');

    expect(appTs).toContain('Unable to map PDF selection to a deterministic anchor. Adjust the selection and try again.');
    expect(appTs).toContain('selection-action-message');
  });

  it('computes offsets via cloneContents textContent for br-safe consistency', () => {
    const appTs = readFileSync(appTsPath, 'utf8');

    expect(appTs).toContain('(startRange.cloneContents().textContent');
    expect(appTs).toContain('(endRange.cloneContents().textContent');
    expect(appTs).not.toContain('startRange.toString().length');
    expect(appTs).not.toContain('endRange.toString().length');
  });

  it('uses getClientRects to filter degenerate margin rects for multi-line selections', () => {
    const appTs = readFileSync(appTsPath, 'utf8');

    expect(appTs).toContain('range.getClientRects()');
    expect(appTs).toContain('r.width > 1 && r.height > 1');
  });
});
