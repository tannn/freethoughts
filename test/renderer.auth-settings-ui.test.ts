import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const htmlPath = join(__dirname, '..', 'src', 'renderer', 'index.html');

describe('renderer auth settings markup', () => {
  it('includes auth mode controls and codex sign-in actions in settings panel', () => {
    const html = readFileSync(htmlPath, 'utf8');

    expect(html).toContain('id="auth-mode-input"');
    expect(html).toContain('id="auth-status-message"');
    expect(html).toContain('id="auth-guidance"');
    expect(html).toContain('id="auth-correlation-state-input"');
    expect(html).toContain('id="auth-login-start-button"');
    expect(html).toContain('id="auth-login-complete-button"');
    expect(html).toContain('id="auth-logout-button"');
  });
});
