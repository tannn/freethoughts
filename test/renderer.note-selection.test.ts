import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appTsPath = join(__dirname, '..', 'src', 'renderer', 'app.ts');

describe('renderer note selection anchors', () => {
  it('captures selection anchor metadata and includes it in note.create', () => {
    const appTs = readFileSync(appTsPath, 'utf8');

    expect(appTs).toContain('computeSelectionAnchor');
    expect(appTs).toContain('selectedTextExcerpt');
    expect(appTs).toContain('paragraphOrdinal');
    expect(appTs).toContain('startOffset');
    expect(appTs).toContain('endOffset');
  });
});
