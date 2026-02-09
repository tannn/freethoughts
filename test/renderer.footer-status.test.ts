import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const htmlPath = join(__dirname, '..', 'src', 'renderer', 'index.html');
const appTsPath = join(__dirname, '..', 'src', 'renderer', 'app.ts');

describe('renderer footer status label', () => {
  it('renders a single footer status label', () => {
    const html = readFileSync(htmlPath, 'utf8');

    expect(html).toContain('id="footer-status"');
    expect(html).not.toContain('id="network-status"');
    expect(html).not.toContain('id="source-status"');
    expect(html).not.toContain('id="ai-status"');
    expect(html).not.toContain('id="generation-status"');
    expect(html).not.toContain('id="source-actions"');
  });

  it('maps status content in renderer logic', () => {
    const appTs = readFileSync(appTsPath, 'utf8');
    const missingIndex = appTs.indexOf("sourceStatus?.status === 'missing'");
    const offlineIndex = appTs.indexOf("Status: offline");
    const aiUnavailableIndex = appTs.indexOf('`Status: AI ${aiAvailability.reason}`');

    expect(appTs).toContain('Status: offline');
    expect(appTs).toContain('Status: AI ${aiAvailability.reason}');
    expect(appTs).toContain('Status: ok');
    expect(missingIndex).toBeGreaterThan(-1);
    expect(offlineIndex).toBeGreaterThan(-1);
    expect(aiUnavailableIndex).toBeGreaterThan(-1);
    expect(missingIndex).toBeLessThan(offlineIndex);
    expect(offlineIndex).toBeLessThan(aiUnavailableIndex);
  });
});
