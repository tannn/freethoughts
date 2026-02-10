import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deriveFooterStatusLabel } from '../src/renderer/footerStatus.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const htmlPath = join(__dirname, '..', 'src', 'renderer', 'index.html');
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
    expect(
      deriveFooterStatusLabel({
        sourceStatus: {
          status: 'missing',
          message: 'Source file not found at original path.'
        },
        aiAvailability: { enabled: false, reason: 'offline', message: 'AI actions disabled while offline.' }
      })
    ).toBe('Status: Source file not found at original path.');

    expect(
      deriveFooterStatusLabel({
        sourceStatus: { status: 'available', message: 'Source file available' },
        aiAvailability: { enabled: false, reason: 'offline', message: 'AI actions disabled while offline.' }
      })
    ).toBe('Status: offline');

    expect(
      deriveFooterStatusLabel({
        sourceStatus: { status: 'available', message: 'Source file available' },
        aiAvailability: { enabled: false, reason: 'auth-unavailable', message: 'Auth status unavailable.' }
      })
    ).toBe('Status: AI auth-unavailable');

    expect(
      deriveFooterStatusLabel({
        sourceStatus: { status: 'available', message: 'Source file available' },
        aiAvailability: { enabled: true, reason: 'ok', message: 'AI actions available' }
      })
    ).toBe('Status: ok');
  });
});
