import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appTsPath = join(__dirname, '..', 'src', 'renderer', 'app.ts');
const htmlPath = join(__dirname, '..', 'src', 'renderer', 'index.html');

describe('renderer note selection anchors', () => {
  it('captures selection anchor metadata and includes it in note.create', () => {
    const appTs = readFileSync(appTsPath, 'utf8');

    expect(appTs).toContain('computeSelectionAnchor');
    expect(appTs).toContain('mapPdfSelectionAnchorToOffsets');
    expect(appTs).toContain('selectedTextExcerpt');
    expect(appTs).toContain('paragraphOrdinal');
    expect(appTs).toContain('startOffset');
    expect(appTs).toContain('endOffset');
    expect(appTs).toContain('selectionNoteInput');
    expect(appTs).toContain('handleNewNoteFromSelection');
    expect(appTs).toContain('Unable to map PDF selection to a deterministic anchor');
  });

  it('renders selection-action note flow in the anchored selection popover', () => {
    const html = readFileSync(htmlPath, 'utf8');
    expect(html).toContain('id="selection-action-note-button"');
    expect(html).toContain('id="selection-note-panel"');
    expect(html).toContain('id="selection-note-input"');
    expect(html).toContain('id="selection-note-create-button"');
    expect(html).toContain('id="pdf-document"');
  });

  it('renders selection-anchored notes with excerpt-only metadata', () => {
    const appTs = readFileSync(appTsPath, 'utf8');

    expect(appTs).toContain('trimExcerpt(note.selectedTextExcerpt');
    expect(appTs).not.toContain('Anchor paragraph');
    expect(appTs).not.toContain('chars ');
  });
});
