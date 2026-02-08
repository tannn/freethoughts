import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appTsPath = join(__dirname, '..', 'src', 'renderer', 'app.ts');
const stylesPath = join(__dirname, '..', 'src', 'renderer', 'styles.css');

describe('renderer note delete affordance', () => {
  it('renders a top-right x delete control on each note card', () => {
    const appTs = readFileSync(appTsPath, 'utf8');
    const styles = readFileSync(stylesPath, 'utf8');

    expect(appTs).toContain("cardHeader.className = 'note-card-header'");
    expect(appTs).toContain("deleteButton.className = 'note-delete-button'");
    expect(appTs).toContain("deleteButton.textContent = 'x'");
    expect(styles).toContain('.note-card-header');
    expect(styles).toContain('justify-content: flex-end;');
    expect(styles).toContain('.note-delete-button');
  });

  it('keeps delete keyboard-accessible and wired to note.delete', () => {
    const appTs = readFileSync(appTsPath, 'utf8');

    expect(appTs).toContain("deleteButton.type = 'button'");
    expect(appTs).toContain("deleteButton.setAttribute('aria-label', 'Delete note')");
    expect(appTs).toContain("deleteButton.addEventListener('click'");
    expect(appTs).toContain('desktopApi.note.delete({ noteId: note.id })');
  });
});
