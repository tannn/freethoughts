import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyAllMigrations,
  listColumns,
  listTables,
  rollbackAllMigrations
} from '../src/persistence/migrations/index.js';
import { SqliteCli } from '../src/persistence/migrations/sqliteCli.js';

const tempDirs: string[] = [];

const createTempDbPath = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'tft-migrations-'));
  tempDirs.push(dir);
  return join(dir, 'test.sqlite');
};

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('persistence migrations', () => {
  it('applies migration up on a clean database', () => {
    const dbPath = createTempDbPath();
    applyAllMigrations(dbPath);

    const tables = listTables(dbPath);
    expect(tables).toEqual([
      'document_revisions',
      'document_settings',
      'documents',
      'note_reassignment_queue',
      'notes',
      'provocations',
      'schema_migrations',
      'sections',
      'workspace_settings'
    ]);

    expect(listColumns(dbPath, 'documents')).toEqual(
      expect.arrayContaining(['id', 'current_revision_id', 'source_sha256'])
    );
    expect(listColumns(dbPath, 'document_revisions')).toEqual(
      expect.arrayContaining(['id', 'document_id', 'revision_number'])
    );
    expect(listColumns(dbPath, 'sections')).toEqual(
      expect.arrayContaining(['revision_id', 'anchor_key'])
    );
    expect(listColumns(dbPath, 'provocations')).toEqual(expect.arrayContaining(['revision_id', 'style']));
    expect(listColumns(dbPath, 'workspace_settings')).toEqual(
      expect.arrayContaining(['generation_model', 'default_provocation_style'])
    );

    const sqlite = new SqliteCli(dbPath);
    const indexRows = sqlite.queryJson<{ name: string; unique: number; partial: number }>(`
      SELECT name, "unique", partial
      FROM pragma_index_list('provocations')
      WHERE name = 'idx_provocations_one_active_per_section_revision';
    `);
    expect(indexRows).toEqual([
      {
        name: 'idx_provocations_one_active_per_section_revision',
        unique: 1,
        partial: 1
      }
    ]);
  });

  it('rolls migrations down cleanly', () => {
    const dbPath = createTempDbPath();
    applyAllMigrations(dbPath);
    rollbackAllMigrations(dbPath);

    const tables = listTables(dbPath);
    expect(tables).toEqual([]);
  });
});
