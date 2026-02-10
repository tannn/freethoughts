import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const htmlPath = join(__dirname, '..', 'src', 'renderer', 'index.html');
const cssPath = join(__dirname, '..', 'src', 'renderer', 'styles.css');
const appTsPath = join(__dirname, '..', 'src', 'renderer', 'app.ts');

describe('renderer notes-first shell', () => {
  it('exposes a transient outline drawer and no persistent left pane markup', () => {
    const html = readFileSync(htmlPath, 'utf8');

    expect(html).toContain('id="outline-toggle-button"');
    expect(html).toContain('id="outline-drawer"');
    expect(html).toContain('id="outline-close-button"');
    expect(html).toContain('id="outline-backdrop"');
    expect(html).not.toContain('class="left-pane"');
  });

  it('uses a two-pane reader layout in styles', () => {
    const css = readFileSync(cssPath, 'utf8');

    expect(css).toContain('grid-template-columns: minmax(320px, 1fr) minmax(280px, 360px);');
    expect(css).toContain('.outline-drawer');
    expect(css).not.toContain('grid-template-columns: minmax(240px, 300px) minmax(320px, 1fr) minmax(280px, 360px);');
  });

  it('wires drawer open-close behavior in renderer logic', () => {
    const appTs = readFileSync(appTsPath, 'utf8');

    expect(appTs).toContain('setOutlineDrawerOpen');
    expect(appTs).toContain('toggleOutlineDrawer');
    expect(appTs).toContain("elements.outlineToggleButton.addEventListener('click'");
    expect(appTs).toContain("elements.outlineBackdrop.addEventListener('click'");
    expect(appTs).toContain("event.key === 'Escape' && state.outlineDrawerOpen");
  });
});
