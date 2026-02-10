import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { captureSourceFingerprint } from '../src/ingestion/fingerprint.js';
import { applyAllMigrations } from '../src/persistence/migrations/index.js';
import { SqliteCli } from '../src/persistence/migrations/sqliteCli.js';
import {
  createDocumentWithFingerprint,
  updateDocumentFingerprint
} from '../src/persistence/documents.js';

const tempDirs: string[] = [];

const createTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'tft-fingerprint-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('source fingerprint persistence', () => {
  it('captures deterministic size/mtime/sha256 from source files', () => {
    const dir = createTempDir();
    const filePath = join(dir, 'source.md');
    writeFileSync(filePath, '# Title\n\nBody text.\n', 'utf8');

    const first = captureSourceFingerprint(filePath);
    const second = captureSourceFingerprint(filePath);

    expect(first).toEqual(second);
    expect(first.size).toBeGreaterThan(0);
    expect(first.mtime).toBeGreaterThan(0);
    expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('stores and updates fingerprints during import and re-import', () => {
    const dir = createTempDir();
    const dbPath = join(dir, 'test.sqlite');
    applyAllMigrations(dbPath);

    const sourceA = join(dir, 'a.md');
    const sourceB = join(dir, 'b.md');
    writeFileSync(sourceA, 'alpha', 'utf8');
    writeFileSync(sourceB, 'alpha beta', 'utf8');

    const fpA = captureSourceFingerprint(sourceA);
    createDocumentWithFingerprint(dbPath, {
      id: 'doc-1',
      workspaceId: 'ws-1',
      sourcePath: sourceA,
      currentRevisionId: null,
      fingerprint: fpA
    });

    const sqlite = new SqliteCli(dbPath);

    const inserted = sqlite.queryJson<{
      source_path: string;
      source_size: number;
      source_mtime: number;
      source_sha256: string;
    }>("SELECT source_path, source_size, source_mtime, source_sha256 FROM documents WHERE id = 'doc-1'");

    expect(inserted[0]).toEqual({
      source_path: sourceA,
      source_size: fpA.size,
      source_mtime: fpA.mtime,
      source_sha256: fpA.sha256
    });

    const fpB = captureSourceFingerprint(sourceB);
    updateDocumentFingerprint(dbPath, {
      documentId: 'doc-1',
      sourcePath: sourceB,
      fingerprint: fpB
    });

    const updated = sqlite.queryJson<{
      source_path: string;
      source_size: number;
      source_mtime: number;
      source_sha256: string;
    }>("SELECT source_path, source_size, source_mtime, source_sha256 FROM documents WHERE id = 'doc-1'");

    expect(updated[0]).toEqual({
      source_path: sourceB,
      source_size: fpB.size,
      source_mtime: fpB.mtime,
      source_sha256: fpB.sha256
    });
  });
});
