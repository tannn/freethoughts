import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DesktopRuntime, type RuntimeApiKeyProvider } from '../src/main/runtime/index.js';
import { createTempDb, createTempDir } from './helpers/db.js';

class FakeApiKeyProvider implements RuntimeApiKeyProvider {
  private apiKey = 'test-key';

  async getApiKey(): Promise<string> {
    return this.apiKey;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  hasApiKey(): boolean {
    return this.apiKey.trim().length > 0;
  }

  deleteApiKey(): boolean {
    const had = this.hasApiKey();
    this.apiKey = '';
    return had;
  }
}

describe('desktop runtime unified feed ordering', () => {
  it('sorts mixed note and provocation rows by deterministic document-position keys', () => {
    const seeded = createTempDb();
    const workspaceDir = createTempDir();
    const sourcePath = join(workspaceDir, 'ordering.md');

    writeFileSync(sourcePath, ['# First', 'Alpha', '', '# Second', 'Beta'].join('\n'), 'utf8');

    const runtime = new DesktopRuntime({
      dbPath: seeded.dbPath,
      apiKeyProvider: new FakeApiKeyProvider(),
      onlineProvider: { isOnline: () => true }
    });

    runtime.openWorkspace(workspaceDir);
    const imported = runtime.importDocument(sourcePath);
    const firstSectionId = imported.sections[0]?.id;
    const secondSectionId = imported.sections[1]?.id;
    const revisionId = imported.document.currentRevisionId;

    if (!firstSectionId || !secondSectionId || !revisionId) {
      throw new Error('Expected two sections and a current revision id for unified-feed ordering test.');
    }

    seeded.sqlite.exec(`
      INSERT INTO notes (
        id, document_id, section_id, content, paragraph_ordinal, start_offset, end_offset, selected_text_excerpt, created_at, updated_at
      ) VALUES
        ('note-s1-root', '${imported.document.id}', '${firstSectionId}', 'section-level note', NULL, NULL, NULL, NULL, '2026-01-01T00:00:01.000Z', '2026-01-01T00:00:01.000Z'),
        ('note-s1-offset-high', '${imported.document.id}', '${firstSectionId}', 'higher offset note', 0, 8, 12, NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ('note-s1-offset-low', '${imported.document.id}', '${firstSectionId}', 'lower offset note', 0, 2, 6, NULL, '2026-01-01T00:00:03.000Z', '2026-01-01T00:00:03.000Z'),
        ('note-s2-para', '${imported.document.id}', '${secondSectionId}', 'second section paragraph note', 1, 1, 5, NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

      INSERT INTO provocations (
        id, document_id, section_id, revision_id, request_id, style, output_text, is_active, created_at
      ) VALUES
        ('prov-s1-root', '${imported.document.id}', '${firstSectionId}', '${revisionId}', 'req-s1', 'skeptical', 'provocation in first section', 1, '2026-01-01T00:00:02.000Z'),
        ('prov-s2-root', '${imported.document.id}', '${secondSectionId}', '${revisionId}', 'req-s2', 'creative', 'provocation in second section', 1, '2026-01-01T00:00:00.000Z');
    `);

    const snapshot = runtime.getSection(firstSectionId);

    expect(snapshot.unifiedFeed.map((item) => `${item.itemType}:${item.id}`)).toEqual([
      'note:note-s1-root',
      'provocation:prov-s1-root',
      'note:note-s1-offset-low',
      'note:note-s1-offset-high',
      'provocation:prov-s2-root',
      'note:note-s2-para'
    ]);
  });
});
