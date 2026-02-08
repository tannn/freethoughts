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
    expect(appTs).toContain('normalizedSection.indexOf(selectedTextExcerpt, boundedHintStart)');
    expect(appTs).toContain('countParagraphOrdinal(normalizedSection, mappedStart)');
    expect(appTs).toContain('paragraphOrdinal: selection.paragraphOrdinal');
    expect(appTs).toContain('startOffset: selection.startOffset');
    expect(appTs).toContain('endOffset: selection.endOffset');
  });

  it('surfaces recoverable guidance when deterministic mapping fails', () => {
    const appTs = readFileSync(appTsPath, 'utf8');

    expect(appTs).toContain('Could not map selected PDF text to a stable anchor. Adjust the selection and try again.');
    expect(appTs).toContain('Unable to map PDF selection to a deterministic anchor. Adjust the selection and try again.');
  });
});
