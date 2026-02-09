import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const htmlPath = join(__dirname, '..', 'src', 'renderer', 'index.html');
const cssPath = join(__dirname, '..', 'src', 'renderer', 'styles.css');
const appTsPath = join(__dirname, '..', 'src', 'renderer', 'app.ts');

describe('renderer footer status', () => {
  it('verifies footer contains network status and generation indicator elements', () => {
    const html = readFileSync(htmlPath, 'utf8');

    expect(html).toContain('id="network-status"');
    expect(html).toContain('id="generation-status"');
    expect(html).toContain('Generating provocation from selected text...');
    expect(html).toContain('id="source-status" class="hidden"');
    expect(html).not.toContain('id="ai-status"');
  });

  it('verifies CSS contains generation indicator animation styles', () => {
    const css = readFileSync(cssPath, 'utf8');

    expect(css).toContain('.status-indicator');
    expect(css).toContain('.status-dot');
    expect(css).toContain('@keyframes statusPulse');
  });

  it('verifies app.ts toggles generation status based on active request', () => {
    const appTs = readFileSync(appTsPath, 'utf8');

    expect(appTs).toContain('generationStatus');
    expect(appTs).toContain('activeProvocationRequestId !== null');
    expect(appTs).toContain("generationStatus.classList.toggle('hidden'");
    expect(appTs).not.toContain('Network: online (');
  });
});
