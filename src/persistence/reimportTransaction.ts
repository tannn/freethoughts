import { SqliteCli } from './migrations/sqliteCli.js';

export interface ReimportSectionInput {
  id: string;
  anchorKey: string;
  heading: string;
  ordinal: number;
  orderIndex: number;
  content: string;
}

export interface ReimportTransactionInput {
  documentId: string;
  revisionId: string;
  revisionNumber: number;
  sourcePath: string;
  sourceSize: number;
  sourceMtime: number;
  sourceSha256: string;
  sections: ReimportSectionInput[];
  forceFailure?: boolean;
}

const sqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`;

const buildSectionsInsert = (input: ReimportTransactionInput): string => {
  if (input.sections.length === 0) {
    throw new Error('Re-import requires at least one section');
  }

  const values = input.sections
    .map((section) => {
      return `(
        ${sqlString(section.id)},
        ${sqlString(input.documentId)},
        ${sqlString(input.revisionId)},
        ${sqlString(section.anchorKey)},
        ${sqlString(section.heading)},
        ${section.ordinal},
        ${section.orderIndex},
        ${sqlString(section.content)}
      )`;
    })
    .join(',\n');

  return `
    INSERT INTO sections (
      id,
      document_id,
      revision_id,
      anchor_key,
      heading,
      ordinal,
      order_index,
      content
    ) VALUES ${values};
  `;
};

export const buildReimportTransactionSql = (input: ReimportTransactionInput): string => {
  const sectionsInsert = buildSectionsInsert(input);
  const forceFailureStatement = input.forceFailure
    ? 'INSERT INTO __forced_failure_table__(value) VALUES (1);'
    : '';

  return `
    BEGIN;

    INSERT INTO document_revisions (
      id,
      document_id,
      revision_number,
      source_path,
      source_size,
      source_mtime,
      source_sha256
    ) VALUES (
      ${sqlString(input.revisionId)},
      ${sqlString(input.documentId)},
      ${input.revisionNumber},
      ${sqlString(input.sourcePath)},
      ${input.sourceSize},
      ${input.sourceMtime},
      ${sqlString(input.sourceSha256)}
    );

    ${sectionsInsert}

    CREATE TEMP TABLE _note_remap_candidates (
      note_id TEXT PRIMARY KEY,
      previous_revision_id TEXT NOT NULL,
      previous_section_id TEXT,
      previous_anchor_key TEXT,
      previous_heading TEXT,
      new_section_id TEXT
    );

    INSERT INTO _note_remap_candidates (
      note_id,
      previous_revision_id,
      previous_section_id,
      previous_anchor_key,
      previous_heading,
      new_section_id
    )
    SELECT
      n.id,
      s_old.revision_id,
      s_old.id,
      s_old.anchor_key,
      s_old.heading,
      (
        SELECT s_new.id
        FROM sections s_new
        WHERE s_new.revision_id = ${sqlString(input.revisionId)}
          AND s_new.anchor_key = s_old.anchor_key
      )
    FROM notes n
    INNER JOIN sections s_old ON s_old.id = n.section_id
    WHERE n.document_id = ${sqlString(input.documentId)}
      AND s_old.revision_id = (
        SELECT current_revision_id
        FROM documents
        WHERE id = ${sqlString(input.documentId)}
      );

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
    )
    SELECT
      ('rq-' || note_id || '-' || substr(hex(randomblob(8)), 1, 8)),
      note_id,
      ${sqlString(input.documentId)},
      previous_revision_id,
      previous_section_id,
      previous_anchor_key,
      previous_heading,
      'open',
      NULL
    FROM _note_remap_candidates
    WHERE new_section_id IS NULL
    ON CONFLICT(note_id) DO UPDATE SET
      document_id = excluded.document_id,
      previous_revision_id = excluded.previous_revision_id,
      previous_section_id = excluded.previous_section_id,
      previous_anchor_key = excluded.previous_anchor_key,
      previous_heading = excluded.previous_heading,
      status = 'open',
      resolved_at = NULL;

    UPDATE notes
    SET section_id = (
      SELECT new_section_id
      FROM _note_remap_candidates r
      WHERE r.note_id = notes.id
    )
    WHERE id IN (
      SELECT note_id
      FROM _note_remap_candidates
      WHERE new_section_id IS NOT NULL
    );

    UPDATE notes
    SET section_id = NULL
    WHERE id IN (
      SELECT note_id
      FROM _note_remap_candidates
      WHERE new_section_id IS NULL
    );

    UPDATE note_reassignment_queue
    SET
      status = 'resolved',
      resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE note_id IN (
      SELECT note_id
      FROM _note_remap_candidates
      WHERE new_section_id IS NOT NULL
    )
      AND status = 'open';

    UPDATE provocations
    SET is_active = 0
    WHERE document_id = ${sqlString(input.documentId)}
      AND revision_id <> ${sqlString(input.revisionId)};

    UPDATE documents
    SET
      source_path = ${sqlString(input.sourcePath)},
      source_size = ${input.sourceSize},
      source_mtime = ${input.sourceMtime},
      source_sha256 = ${sqlString(input.sourceSha256)},
      current_revision_id = ${sqlString(input.revisionId)},
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ${sqlString(input.documentId)};

    ${forceFailureStatement}

    DROP TABLE _note_remap_candidates;

    COMMIT;
  `;
};

export const runReimportTransaction = (dbPath: string, input: ReimportTransactionInput): void => {
  const sqlite = new SqliteCli(dbPath);
  const sql = buildReimportTransactionSql(input);
  sqlite.exec(sql);
};
