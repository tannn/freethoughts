import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const htmlPath = join(__dirname, '..', 'src', 'renderer', 'index.html');
const appTsPath = join(__dirname, '..', 'src', 'renderer', 'app.ts');
const stylesPath = join(__dirname, '..', 'src', 'renderer', 'styles.css');

describe('renderer provocation style overlay', () => {
  it('renders selection action chooser with note/provocation branching and provocation style options', () => {
    const html = readFileSync(htmlPath, 'utf8');

    expect(html).toContain('id="provocation-style-overlay"');
    expect(html).toContain('class="selection-popover hidden"');
    expect(html).toContain('id="selection-action-chooser"');
    expect(html).toContain('id="selection-action-note-button"');
    expect(html).toContain('id="selection-action-provocation-button"');
    expect(html).toContain('id="selection-note-panel"');
    expect(html).toContain('id="selection-note-create-button"');
    expect(html).toContain('id="selection-provocation-panel"');
    expect(html).toContain('id="provocation-style-menu-button"');
    expect(html).toContain('id="provocation-style-menu"');
    expect(html).toContain('id="provocation-style-option-skeptical"');
    expect(html).toContain('id="provocation-style-option-creative"');
    expect(html).toContain('id="provocation-style-option-methodological"');
    expect(html).toContain('class="style-option-check"');
    expect(html).toContain('id="provocation-style-cancel-button"');
    expect(html).toContain('id="provocation-style-generate-button"');
  });

  it('uses workspace default style preselect and request-level style override in renderer logic', () => {
    const appTs = readFileSync(appTsPath, 'utf8');

    expect(appTs).toContain('getWorkspaceDefaultProvocationStyle');
    expect(appTs).toContain("state.settings?.defaultProvocationStyle ?? 'skeptical'");
    expect(appTs).toContain('setSelectionPopoverMode');
    expect(appTs).toContain("selectionPopoverMode: 'chooser'");
    expect(appTs).toContain('openSelectionActionOverlay');
    expect(appTs).toContain('pendingSelectionProvocationStyle');
    expect(appTs).toContain('openProvocationStyleOverlay');
    expect(appTs).toContain('openSelectionNoteOverlay');
    expect(appTs).toContain('handleSelectionTriggeredNoteCreate');
    expect(appTs).toContain('setPendingSelectionProvocationStyle');
    expect(appTs).toContain('style: state.pendingSelectionProvocationStyle');
    expect(appTs).toContain("elements.provocationStyleMenuButton.addEventListener('click'");
  });

  it('shows active style checkmark on the right edge via style-option classes', () => {
    const styles = readFileSync(stylesPath, 'utf8');

    expect(styles).toContain('.selection-popover');
    expect(styles).toContain('.provocation-style-popover');
    expect(styles).toContain('.style-option');
    expect(styles).toContain('justify-content: space-between;');
    expect(styles).toContain('.style-option-check');
    expect(styles).toContain('.style-option.active .style-option-check');
  });

  it('prioritizes selected text and opens popover only on finalized selection events', () => {
    const appTs = readFileSync(appTsPath, 'utf8');
    const targetFn = appTs.match(/const getSelectionTriggeredProvocationTarget[\s\S]*?return null;\n};/);
    const body = targetFn?.[0] ?? '';

    expect(body).toContain('if (state.selectionAnchor)');
    expect(body).toContain('const selectedNote');
    expect(body.indexOf('if (state.selectionAnchor)')).toBeLessThan(body.indexOf('const selectedNote'));
    expect(appTs).toContain("updateSelectionAnchor({ openPopoverOnSelection: true })");
    expect(appTs).not.toContain("document.addEventListener('selectionchange'");
    expect(appTs).toContain('readSelectionViewportRect(elements.pdfDocument)');
    expect(appTs).toContain('selectionPopoverAnchorRect');
    expect(appTs).toContain('positionProvocationStyleOverlay');
    expect(appTs).toContain('openSelectionActionOverlay(');
    expect(appTs).toContain('openPopoverOnSelection && !state.settingsModalOpen && state.activeProvocationRequestId === null');
    expect(appTs).not.toContain('if (aiAvailability.enabled && !state.settingsModalOpen && state.activeProvocationRequestId === null)');
    expect(appTs).toContain('const canUseAi = Boolean(canContinue && aiAvailability.enabled);');
    expect(appTs).toContain('elements.selectionActionProvocationButton.disabled = !canUseAi;');
    expect(appTs).toContain('openProvocationStyleOverlay(');
    expect(appTs).toContain("elements.selectionActionNoteButton.addEventListener('click'");
    expect(appTs).toContain("elements.selectionActionProvocationButton.addEventListener('click'");
    expect(appTs).toContain("label: 'selected text'");
  });
});
