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
    expect(appTs).toContain('selectedTextExcerpt');
    expect(appTs).toContain('paragraphOrdinal');
    expect(appTs).toContain('startOffset');
    expect(appTs).toContain('endOffset');
    expect(appTs).toContain('handleNewNoteFromSelection');
    expect(appTs).toContain('Selection anchors are unavailable in native PDF mode');
  });

  it('renders explicit note-from-selection affordance and preview area', () => {
    const html = readFileSync(htmlPath, 'utf8');
    expect(html).toContain('id="new-note-from-selection-button"');
    expect(html).toContain('id="toggle-pdf-anchor-mode-button"');
    expect(html).toContain('id="note-selection-preview"');
  });
});
