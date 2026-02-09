import { describe, expect, it } from 'vitest';
import { ReaderShellController } from '../src/reader/shell.js';

describe('reader shell controller', () => {
  it('keeps one active document at a time', () => {
    const shell = new ReaderShellController();

    shell.openDocument('doc-1', 'sec-1');
    expect(shell.snapshot().activeDocumentId).toBe('doc-1');

    shell.openDocument('doc-2', 'sec-9');
    const snapshot = shell.snapshot();
    expect(snapshot.activeDocumentId).toBe('doc-2');
    expect(snapshot.activeSectionId).toBe('sec-9');
  });

  it('preserves selected right-pane tab per document across section navigation', () => {
    const shell = new ReaderShellController();

    shell.openDocument('doc-1', 'sec-1');
    shell.selectRightPaneTab('provocation');
    shell.selectSection('sec-2');

    expect(shell.snapshot().selectedTab).toBe('provocation');
    expect(shell.snapshot().activeSectionId).toBe('sec-2');

    shell.openDocument('doc-2', 'sec-a');
    expect(shell.snapshot().selectedTab).toBe('all');

    shell.openDocument('doc-1');
    expect(shell.snapshot().selectedTab).toBe('provocation');
  });

  it('exposes persistent unassigned notes navigation and supports opening that center view', () => {
    const shell = new ReaderShellController();
    shell.openDocument('doc-1', 'sec-1');

    expect(shell.snapshot().leftNavItems).toEqual(['documents', 'unassigned-notes']);

    shell.openUnassignedNotesView();
    expect(shell.snapshot().centerView).toBe('unassigned-notes');

    shell.selectSection('sec-1');
    expect(shell.snapshot().centerView).toBe('section');
  });
});
