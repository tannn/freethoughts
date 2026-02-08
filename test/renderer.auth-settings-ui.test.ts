import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const htmlPath = join(__dirname, '..', 'src', 'renderer', 'index.html');
const appTsPath = join(__dirname, '..', 'src', 'renderer', 'app.ts');

describe('renderer auth settings markup', () => {
  it('includes top-nav gear trigger and settings modal controls', () => {
    const html = readFileSync(htmlPath, 'utf8');

    expect(html).toContain('id="settings-open-button"');
    expect(html).toContain('id="settings-modal"');
    expect(html).toContain('id="settings-close-button"');
    expect(html).toContain('id="settings-cancel-button"');
    expect(html).toContain('id="auth-mode-input"');
    expect(html).toContain('id="auth-status-message"');
    expect(html).toContain('id="auth-guidance"');
    expect(html).toContain('id="auth-correlation-state-input"');
    expect(html).toContain('id="auth-login-start-button"');
    expect(html).toContain('id="auth-login-complete-button"');
    expect(html).toContain('id="auth-logout-button"');
    expect(html).not.toContain('class="panel settings-panel"');
  });

  it('includes explicit switch-to-api-key guidance for codex runtime and permission failures', () => {
    const appTs = readFileSync(appTsPath, 'utf8');

    expect(appTs).toContain('Codex App Server runtime unavailable or inaccessible. Switch to API key mode.');
    expect(appTs).toContain('Codex login lacks required generation permission. Switch to API key mode.');
  });

  it('keeps unified-feed and selection popover entry structure intact', () => {
    const html = readFileSync(htmlPath, 'utf8');

    expect(html).toContain('id="feed-filter-all-button"');
    expect(html).toContain('id="feed-filter-notes-button"');
    expect(html).toContain('id="feed-filter-provocation-button"');
    expect(html).toContain('id="unified-feed-list"');
    expect(html).toContain('id="selection-action-chooser"');
  });

  it('wires settings modal open and close behavior in renderer logic', () => {
    const appTs = readFileSync(appTsPath, 'utf8');

    expect(appTs).toContain('setSettingsModalOpen');
    expect(appTs).toContain('openSettingsModal');
    expect(appTs).toContain('closeSettingsModal');
    expect(appTs).toContain("elements.settingsOpenButton.addEventListener('click'");
    expect(appTs).toContain("elements.settingsModal.addEventListener('click'");
    expect(appTs).toContain("event.key === 'Escape' && state.settingsModalOpen");
  });
});
