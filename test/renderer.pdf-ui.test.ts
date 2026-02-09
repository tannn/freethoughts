import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const htmlPath = join(__dirname, '..', 'src', 'renderer', 'index.html');
const cssPath = join(__dirname, '..', 'src', 'renderer', 'styles.css');
const appTsPath = join(__dirname, '..', 'src', 'renderer', 'app.ts');

describe('renderer pdf surface markup', () => {
  it('includes native pdf surface and fallback containers', () => {
    const html = readFileSync(htmlPath, 'utf8');

    expect(html).toContain('id="pdf-surface"');
    expect(html).toContain('id="pdf-document"');
    expect(html).toContain('id="pdf-zoom-out-button"');
    expect(html).toContain('id="pdf-zoom-in-button"');
    expect(html).toContain('id="pdf-zoom-reset-button"');
    expect(html).toContain('id="pdf-zoom-label"');
    expect(html).toContain('id="pdf-fallback"');
    expect(html).toContain('id="section-content"');
    expect(html).toContain("frame-src 'self' file: chrome-extension:");
  });

  it('toggles pdf surface in renderer logic for pdf documents', () => {
    const appTs = readFileSync(appTsPath, 'utf8');

    expect(appTs).toContain("document.fileType === 'pdf'");
    expect(appTs).toContain('pdfSurface');
    expect(appTs).toContain('pdfFallback');
    expect(appTs).toContain('pdfDocument');
    expect(appTs).toContain("import('./vendor/pdfjs/pdf.mjs')");
    expect(appTs).toContain('setPdfZoom');
    expect(appTs).toContain('applyPdfZoom');
    expect(appTs).toContain('window.devicePixelRatio');
    expect(appTs).toContain('transform: outputScale > 1');
    expect(appTs).toContain("style.setProperty('--scale-factor'");
  });

  it('keeps the pdf viewport scrollable when zoomed wider than the center pane', () => {
    const css = readFileSync(cssPath, 'utf8');

    const readRule = (selector: string): string | null => {
      const selectorIndex = css.indexOf(selector);
      if (selectorIndex < 0) {
        return null;
      }

      const braceStart = css.indexOf('{', selectorIndex);
      if (braceStart < 0) {
        return null;
      }

      let depth = 0;
      for (let index = braceStart; index < css.length; index += 1) {
        if (css[index] === '{') {
          depth += 1;
        } else if (css[index] === '}') {
          depth -= 1;
          if (depth === 0) {
            return css.slice(braceStart + 1, index);
          }
        }
      }

      return null;
    };

    const pdfViewportRule = readRule('.pdf-viewport');
    const pdfDocumentRule = readRule('.pdf-document');

    expect(pdfViewportRule).not.toBeNull();
    expect(pdfViewportRule).toContain('overflow: auto;');
    expect(pdfDocumentRule).not.toBeNull();
    expect(pdfDocumentRule).toContain('width: max-content;');
    expect(pdfDocumentRule).toContain('min-width: 100%;');
  });
});
