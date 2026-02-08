import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const htmlPath = join(__dirname, '..', 'src', 'renderer', 'index.html');
const appTsPath = join(__dirname, '..', 'src', 'renderer', 'app.ts');

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

  it('includes explicit switch-to-api-key guidance for codex runtime and permission failures', () => {
    const appTs = readFileSync(appTsPath, 'utf8');

    expect(appTs).toContain('Codex App Server runtime unavailable or inaccessible. Switch to API key mode.');
    expect(appTs).toContain('Codex login lacks required generation permission. Switch to API key mode.');
  });

  it('keeps notes and provocation pane structure intact', () => {
    const html = readFileSync(htmlPath, 'utf8');

    expect(html).toContain('id="notes-tab-button"');
    expect(html).toContain('id="provocation-tab-button"');
    expect(html).toContain('id="notes-list"');
    expect(html).toContain('id="provocation-message"');
  });
});
