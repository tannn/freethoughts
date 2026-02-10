import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';
import { applyAllMigrations } from '../../src/persistence/migrations/index.js';
import { SqliteCli } from '../../src/persistence/migrations/sqliteCli.js';

const tempDirs: string[] = [];

export const createTempDb = (): { dbPath: string; sqlite: SqliteCli } => {
  const dir = mkdtempSync(join(tmpdir(), 'tft-reader-'));
  tempDirs.push(dir);
  const dbPath = join(dir, 'test.sqlite');
  applyAllMigrations(dbPath);
  return { dbPath, sqlite: new SqliteCli(dbPath) };
};

export const createTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'tft-reader-dir-'));
  tempDirs.push(dir);
  return dir;
};

export const seedDocumentRevision = (
  sqlite: SqliteCli,
  options: {
    documentId: string;
    revisionId: string;
    sourcePath?: string;
    sections: Array<{ id: string; anchorKey: string; heading: string; orderIndex: number; content: string }>;
  }
): void => {
  const sourcePath = options.sourcePath ?? '/docs/input.md';

  sqlite.exec(`
    INSERT INTO documents (
      id,
      workspace_id,
      source_path,
      source_size,
      source_mtime,
      source_sha256,
      current_revision_id
    ) VALUES (
      '${options.documentId}',
      'ws-1',
      '${sourcePath}',
      100,
      1000,
      'sha-seed',
      '${options.revisionId}'
    );

    INSERT INTO document_revisions (
      id,
      document_id,
      revision_number,
      source_path,
      source_size,
      source_mtime,
      source_sha256
    ) VALUES (
      '${options.revisionId}',
      '${options.documentId}',
      1,
      '${sourcePath}',
      100,
      1000,
      'sha-seed'
    );
  `);

  const sectionValues = options.sections
    .map(
      (section, index) => `(
        '${section.id}',
        '${options.documentId}',
        '${options.revisionId}',
        '${section.anchorKey}',
        '${section.heading.replaceAll("'", "''")}',
        1,
        ${section.orderIndex ?? index},
        '${section.content.replaceAll("'", "''")}'
      )`
    )
    .join(',\n');

  sqlite.exec(`
    INSERT INTO sections (
      id,
      document_id,
      revision_id,
      anchor_key,
      heading,
      ordinal,
      order_index,
      content
    ) VALUES ${sectionValues};
  `);
};

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});
