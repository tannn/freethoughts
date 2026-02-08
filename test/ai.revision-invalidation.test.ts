import { describe, expect, it } from 'vitest';
import { AiSettingsRepository, OpenAIClient, ProvocationService } from '../src/ai/index.js';
import { createTempDb } from './helpers/db.js';

describe('revision-scoped provocation history', () => {
  it('keeps prior revision outputs while listing only the current revision', () => {
    const seeded = createTempDb();

    seeded.sqlite.exec(`
      INSERT INTO documents (
        id,
        workspace_id,
        source_path,
        source_size,
        source_mtime,
        source_sha256,
        current_revision_id
      ) VALUES (
        'doc-1',
        'ws-1',
        '/docs/input.md',
        100,
        1000,
        'sha-1',
        'rev-2'
      );

      INSERT INTO document_revisions (
        id,
        document_id,
        revision_number,
        source_path,
        source_size,
        source_mtime,
        source_sha256
      ) VALUES
        ('rev-1', 'doc-1', 1, '/docs/input.md', 100, 1000, 'sha-1'),
        ('rev-2', 'doc-1', 2, '/docs/input.md', 120, 2000, 'sha-2');

      INSERT INTO sections (
        id,
        document_id,
        revision_id,
        anchor_key,
        heading,
        ordinal,
        order_index,
        content
      ) VALUES
        ('sec-r1', 'doc-1', 'rev-1', 'a#1', 'A', 1, 0, 'old section'),
        ('sec-r2', 'doc-1', 'rev-2', 'a#1', 'A', 1, 0, 'new section');

      INSERT INTO provocations (
        id,
        document_id,
        section_id,
        revision_id,
        request_id,
        style,
        output_text,
        is_active
      ) VALUES
        ('prov-old', 'doc-1', 'sec-r1', 'rev-1', 'req-old', 'skeptical', 'old', 1),
        ('prov-new', 'doc-1', 'sec-r2', 'rev-2', 'req-new', 'skeptical', 'new', 1);
    `);

    const settings = new AiSettingsRepository(seeded.dbPath);
    const client = new OpenAIClient(
      settings,
      { getApiKey: async () => 'key' },
      {
        async generate() {
          return { text: 'unused' };
        }
      },
      { timeoutMs: 5000, retryDelaysMs: [5, 15] },
      async () => Promise.resolve(),
      () => 0
    );

    const service = new ProvocationService(seeded.dbPath, settings, client);

    const currentHistory = service.listHistory('doc-1', 'sec-r2');
    expect(currentHistory.map((entry) => entry.id)).toEqual(['prov-new']);

    const rows = seeded.sqlite.queryJson<{ id: string; is_active: number }>(`
      SELECT id, is_active
      FROM provocations
      WHERE document_id = 'doc-1'
      ORDER BY id ASC;
    `);

    expect(rows).toEqual([
      { id: 'prov-new', is_active: 1 },
      { id: 'prov-old', is_active: 1 }
    ]);
  });
});
