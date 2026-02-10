import { AppError } from '../shared/ipc/errors.js';
import { SqliteCli } from '../persistence/migrations/sqliteCli.js';

export interface UnassignedNoteItem {
  noteId: string;
  content: string;
  previousSectionId: string | null;
  previousAnchorKey: string | null;
  previousHeading: string | null;
  queuedAt: string;
}

interface UnassignedRow {
  note_id: string;
  content: string;
  previous_section_id: string | null;
  previous_anchor_key: string | null;
  previous_heading: string | null;
  created_at: string;
}

const sqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`;

const mapUnassigned = (row: UnassignedRow): UnassignedNoteItem => ({
  noteId: row.note_id,
  content: row.content,
  previousSectionId: row.previous_section_id,
  previousAnchorKey: row.previous_anchor_key,
  previousHeading: row.previous_heading,
  queuedAt: row.created_at
});

export class ReassignmentService {
  private readonly sqlite: SqliteCli;

  constructor(dbPath: string) {
    this.sqlite = new SqliteCli(dbPath);
  }

  listUnassignedNotes(documentId: string): UnassignedNoteItem[] {
    const rows = this.sqlite.queryJson<UnassignedRow>(`
      SELECT
        q.note_id,
        n.content,
        q.previous_section_id,
        q.previous_anchor_key,
        q.previous_heading,
        q.created_at
      FROM note_reassignment_queue q
      INNER JOIN notes n ON n.id = q.note_id
      WHERE q.document_id = ${sqlString(documentId)}
        AND q.status = 'open'
      ORDER BY q.created_at ASC;
    `);

    return rows.map(mapUnassigned);
  }

  skipForNow(documentId: string, noteId: string): void {
    const rows = this.sqlite.queryJson<{ note_id: string }>(`
      SELECT note_id
      FROM note_reassignment_queue
      WHERE document_id = ${sqlString(documentId)}
        AND note_id = ${sqlString(noteId)}
        AND status = 'open'
      LIMIT 1;
    `);

    if (!rows[0]) {
      throw new AppError('E_NOT_FOUND', 'Open reassignment item not found', { documentId, noteId });
    }
  }

  reassign(documentId: string, noteId: string, targetSectionId: string): void {
    const targetSectionRows = this.sqlite.queryJson<{ id: string }>(`
      SELECT s.id
      FROM sections s
      INNER JOIN documents d ON d.id = s.document_id
      WHERE s.id = ${sqlString(targetSectionId)}
        AND s.document_id = ${sqlString(documentId)}
        AND s.revision_id = d.current_revision_id
      LIMIT 1;
    `);

    if (!targetSectionRows[0]) {
      throw new AppError('E_CONFLICT', 'Target section is not in current document revision', {
        documentId,
        targetSectionId
      });
    }

    const queueRows = this.sqlite.queryJson<{ note_id: string }>(`
      SELECT note_id
      FROM note_reassignment_queue
      WHERE document_id = ${sqlString(documentId)}
        AND note_id = ${sqlString(noteId)}
        AND status = 'open'
      LIMIT 1;
    `);

    if (!queueRows[0]) {
      throw new AppError('E_NOT_FOUND', 'Open reassignment item not found', { documentId, noteId });
    }

    this.sqlite.exec(`
      BEGIN;
      UPDATE notes
      SET section_id = ${sqlString(targetSectionId)}
      WHERE id = ${sqlString(noteId)}
        AND document_id = ${sqlString(documentId)};

      UPDATE note_reassignment_queue
      SET
        status = 'resolved',
        resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE note_id = ${sqlString(noteId)}
        AND document_id = ${sqlString(documentId)}
        AND status = 'open';
      COMMIT;
    `);
  }
}
