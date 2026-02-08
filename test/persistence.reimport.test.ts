import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyAllMigrations } from '../src/persistence/migrations/index.js';
import { SqliteCli } from '../src/persistence/migrations/sqliteCli.js';
import {
  runReimportTransaction,
  type ReimportTransactionInput
} from '../src/persistence/reimportTransaction.js';

const tempDirs: string[] = [];

const createTempDb = (): { dbPath: string; sqlite: SqliteCli } => {
  const dir = mkdtempSync(join(tmpdir(), 'tft-reimport-'));
  tempDirs.push(dir);
  const dbPath = join(dir, 'test.sqlite');
  applyAllMigrations(dbPath);
  return { dbPath, sqlite: new SqliteCli(dbPath) };
};

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const seedRevisionOne = (sqlite: SqliteCli): void => {
  sqlite.exec(`
    INSERT INTO documents (
      id, workspace_id, source_path, source_size, source_mtime, source_sha256, current_revision_id
    ) VALUES (
      'doc-1', 'ws-1', '/docs/file.md', 100, 1000, 'sha-old', 'rev-1'
    );

    INSERT INTO document_revisions (
      id, document_id, revision_number, source_path, source_size, source_mtime, source_sha256
    ) VALUES (
      'rev-1', 'doc-1', 1, '/docs/file.md', 100, 1000, 'sha-old'
    );

    INSERT INTO sections (id, document_id, revision_id, anchor_key, heading, ordinal, order_index, content)
    VALUES
      ('sec-1a', 'doc-1', 'rev-1', 'intro#1', 'Intro', 1, 0, 'Intro text'),
      ('sec-1b', 'doc-1', 'rev-1', 'method#1', 'Method', 1, 1, 'Method text');

    INSERT INTO notes (id, document_id, section_id, content)
    VALUES
      ('note-1', 'doc-1', 'sec-1a', 'keep me mapped'),
      ('note-2', 'doc-1', 'sec-1b', 'will become unassigned');

    INSERT INTO provocations (id, document_id, section_id, revision_id, request_id, style, output_text, is_active)
    VALUES
      ('prov-1', 'doc-1', 'sec-1a', 'rev-1', 'req-1', 'skeptical', 'Old output', 1);
  `);
};

const buildReimportInput = (): ReimportTransactionInput => ({
  documentId: 'doc-1',
  revisionId: 'rev-2',
  revisionNumber: 2,
  sourcePath: '/docs/file.md',
  sourceSize: 110,
  sourceMtime: 2000,
  sourceSha256: 'sha-new',
  sections: [
    {
      id: 'sec-2a',
      anchorKey: 'intro#1',
      heading: 'Intro',
      ordinal: 1,
      orderIndex: 0,
      content: 'Intro v2 text'
    },
    {
      id: 'sec-2c',
      anchorKey: 'results#1',
      heading: 'Results',
      ordinal: 1,
      orderIndex: 1,
      content: 'Results text'
    }
  ]
});

describe('re-import transaction', () => {
  it('remaps by exact anchor_key and queues unmatched notes atomically', () => {
    const { dbPath, sqlite } = createTempDb();
    seedRevisionOne(sqlite);

    runReimportTransaction(dbPath, buildReimportInput());

    const document = sqlite.queryJson<{ current_revision_id: string; source_sha256: string }>(
      "SELECT current_revision_id, source_sha256 FROM documents WHERE id = 'doc-1'"
    );
    expect(document[0]).toEqual({ current_revision_id: 'rev-2', source_sha256: 'sha-new' });

    const notes = sqlite.queryJson<{ id: string; section_id: string | null }>(
      "SELECT id, section_id FROM notes WHERE document_id = 'doc-1' ORDER BY id"
    );
    expect(notes).toEqual([
      { id: 'note-1', section_id: 'sec-2a' },
      { id: 'note-2', section_id: null }
    ]);

    const queue = sqlite.queryJson<{
      note_id: string;
      previous_anchor_key: string;
      status: string;
    }>(
      "SELECT note_id, previous_anchor_key, status FROM note_reassignment_queue ORDER BY note_id"
    );
    expect(queue).toEqual([{ note_id: 'note-2', previous_anchor_key: 'method#1', status: 'open' }]);

    const provocation = sqlite.queryJson<{ is_active: number }>(
      "SELECT is_active FROM provocations WHERE id = 'prov-1'"
    );
    expect(provocation).toEqual([{ is_active: 0 }]);
  });

  it('rolls back full re-import state when any step fails', () => {
    const { dbPath, sqlite } = createTempDb();
    seedRevisionOne(sqlite);

    expect(() =>
      runReimportTransaction(dbPath, {
        ...buildReimportInput(),
        forceFailure: true
      })
    ).toThrow();

    const revisions = sqlite.queryJson<{ id: string }>(
      "SELECT id FROM document_revisions WHERE document_id = 'doc-1' ORDER BY revision_number"
    );
    expect(revisions).toEqual([{ id: 'rev-1' }]);

    const document = sqlite.queryJson<{ current_revision_id: string; source_sha256: string }>(
      "SELECT current_revision_id, source_sha256 FROM documents WHERE id = 'doc-1'"
    );
    expect(document[0]).toEqual({ current_revision_id: 'rev-1', source_sha256: 'sha-old' });

    const notes = sqlite.queryJson<{ id: string; section_id: string | null }>(
      "SELECT id, section_id FROM notes WHERE document_id = 'doc-1' ORDER BY id"
    );
    expect(notes).toEqual([
      { id: 'note-1', section_id: 'sec-1a' },
      { id: 'note-2', section_id: 'sec-1b' }
    ]);

    const queue = sqlite.queryJson<{ note_id: string }>(
      'SELECT note_id FROM note_reassignment_queue ORDER BY note_id'
    );
    expect(queue).toEqual([]);

    const provocation = sqlite.queryJson<{ is_active: number }>(
      "SELECT is_active FROM provocations WHERE id = 'prov-1'"
    );
    expect(provocation).toEqual([{ is_active: 1 }]);
  });

  it('resolves any open reassignment queue rows when notes are remapped to a section', () => {
    const { dbPath, sqlite } = createTempDb();
    seedRevisionOne(sqlite);

    sqlite.exec(`
      INSERT INTO note_reassignment_queue (
        id,
        note_id,
        document_id,
        previous_revision_id,
        previous_section_id,
        previous_anchor_key,
        previous_heading,
        status,
        resolved_at
      ) VALUES (
        'rq-seeded',
        'note-1',
        'doc-1',
        'rev-1',
        'sec-1a',
        'intro#1',
        'Intro',
        'open',
        NULL
      );
    `);

    runReimportTransaction(dbPath, buildReimportInput());

    const queue = sqlite.queryJson<{ note_id: string; status: string; resolved_at: string | null }>(
      "SELECT note_id, status, resolved_at FROM note_reassignment_queue WHERE note_id = 'note-1'"
    );

    expect(queue).toHaveLength(1);
    expect(queue[0]?.note_id).toBe('note-1');
    expect(queue[0]?.status).toBe('resolved');
    expect(queue[0]?.resolved_at).not.toBeNull();
  });
});
