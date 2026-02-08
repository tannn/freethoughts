import { SqliteCli } from './migrations/sqliteCli.js';
import type { SourceFingerprint } from '../ingestion/fingerprint.js';

export interface CreateDocumentInput {
  id: string;
  workspaceId: string;
  sourcePath: string;
  currentRevisionId: string | null;
  fingerprint: SourceFingerprint;
}

const sqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`;

export const createDocumentWithFingerprint = (dbPath: string, input: CreateDocumentInput): void => {
  const sqlite = new SqliteCli(dbPath);
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
      ${sqlString(input.id)},
      ${sqlString(input.workspaceId)},
      ${sqlString(input.sourcePath)},
      ${input.fingerprint.size},
      ${input.fingerprint.mtime},
      ${sqlString(input.fingerprint.sha256)},
      ${input.currentRevisionId === null ? 'NULL' : sqlString(input.currentRevisionId)}
    );
  `);
};

export interface UpdateDocumentFingerprintInput {
  documentId: string;
  sourcePath: string;
  fingerprint: SourceFingerprint;
}

export const updateDocumentFingerprint = (
  dbPath: string,
  input: UpdateDocumentFingerprintInput
): void => {
  const sqlite = new SqliteCli(dbPath);
  sqlite.exec(`
    UPDATE documents
    SET
      source_path = ${sqlString(input.sourcePath)},
      source_size = ${input.fingerprint.size},
      source_mtime = ${input.fingerprint.mtime},
      source_sha256 = ${sqlString(input.fingerprint.sha256)},
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ${sqlString(input.documentId)};
  `);
};
