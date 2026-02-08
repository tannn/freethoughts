import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appTsPath = join(__dirname, '..', 'src', 'renderer', 'app.ts');

describe('renderer notes editor interaction', () => {
  it('does not re-render the notes list on focus to preserve caret and selection', () => {
    const appTs = readFileSync(appTsPath, 'utf8');
    const focusHandler = appTs.match(/textarea\.addEventListener\('focus',[\s\S]*?\);/);

    expect(focusHandler).toBeTruthy();
    expect(focusHandler?.[0]).not.toContain('renderNotes(');
  });

  it('tracks note cards by id for selection sync', () => {
    const appTs = readFileSync(appTsPath, 'utf8');

    expect(appTs).toContain('card.dataset.noteId');
    expect(appTs).toContain('syncSelectedNoteCard');
  });
});
