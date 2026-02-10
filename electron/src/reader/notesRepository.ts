import { randomUUID } from 'node:crypto';
import { AppError } from '../shared/ipc/errors.js';
import { SqliteCli } from '../persistence/migrations/sqliteCli.js';

export interface NoteRecord {
  id: string;
  documentId: string;
  sectionId: string | null;
  content: string;
  paragraphOrdinal: number | null;
  startOffset: number | null;
  endOffset: number | null;
  selectedTextExcerpt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DbNoteRow {
  id: string;
  document_id: string;
  section_id: string | null;
  content: string;
  paragraph_ordinal: number | null;
  start_offset: number | null;
  end_offset: number | null;
  selected_text_excerpt: string | null;
  created_at: string;
  updated_at: string;
}

const sqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`;
const sqlNullableString = (value: string | null | undefined): string =>
  value === null || value === undefined ? 'NULL' : sqlString(value);
const sqlNullableNumber = (value: number | null | undefined): string =>
  value === null || value === undefined ? 'NULL' : `${value}`;

const mapNoteRow = (row: DbNoteRow): NoteRecord => ({
  id: row.id,
  documentId: row.document_id,
  sectionId: row.section_id,
  content: row.content,
  paragraphOrdinal: row.paragraph_ordinal,
  startOffset: row.start_offset,
  endOffset: row.end_offset,
  selectedTextExcerpt: row.selected_text_excerpt,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export interface CreateNoteInput {
  documentId: string;
  sectionId: string;
  content: string;
  noteId?: string;
  paragraphOrdinal?: number | null;
  startOffset?: number | null;
  endOffset?: number | null;
  selectedTextExcerpt?: string | null;
}

export class NotesRepository {
  private readonly sqlite: SqliteCli;

  constructor(dbPath: string) {
    this.sqlite = new SqliteCli(dbPath);
  }

  create(input: CreateNoteInput): NoteRecord {
    const noteId = input.noteId ?? `note-${randomUUID()}`;

    this.sqlite.exec(`
      INSERT INTO notes (
        id,
        document_id,
        section_id,
        content,
        paragraph_ordinal,
        start_offset,
        end_offset,
        selected_text_excerpt
      )
      VALUES (
        ${sqlString(noteId)},
        ${sqlString(input.documentId)},
        ${sqlString(input.sectionId)},
        ${sqlString(input.content)},
        ${sqlNullableNumber(input.paragraphOrdinal)},
        ${sqlNullableNumber(input.startOffset)},
        ${sqlNullableNumber(input.endOffset)},
        ${sqlNullableString(input.selectedTextExcerpt)}
      );
    `);

    const created = this.getById(noteId);
    if (!created) {
      throw new AppError('E_INTERNAL', 'Failed to load created note');
    }

    return created;
  }

  update(noteId: string, content: string): NoteRecord {
    this.sqlite.exec(`
      UPDATE notes
      SET
        content = ${sqlString(content)},
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ${sqlString(noteId)};
    `);

    const updated = this.getById(noteId);
    if (!updated) {
      throw new AppError('E_NOT_FOUND', 'Note not found', { noteId });
    }

    return updated;
  }

  delete(noteId: string): void {
    this.sqlite.exec(`DELETE FROM notes WHERE id = ${sqlString(noteId)};`);
  }

  getById(noteId: string): NoteRecord | null {
    const rows = this.sqlite.queryJson<DbNoteRow>(`
      SELECT
        id,
        document_id,
        section_id,
        content,
        paragraph_ordinal,
        start_offset,
        end_offset,
        selected_text_excerpt,
        created_at,
        updated_at
      FROM notes
      WHERE id = ${sqlString(noteId)}
      LIMIT 1;
    `);

    return rows[0] ? mapNoteRow(rows[0]) : null;
  }

  listBySection(documentId: string, sectionId: string): NoteRecord[] {
    const rows = this.sqlite.queryJson<DbNoteRow>(`
      SELECT
        id,
        document_id,
        section_id,
        content,
        paragraph_ordinal,
        start_offset,
        end_offset,
        selected_text_excerpt,
        created_at,
        updated_at
      FROM notes
      WHERE document_id = ${sqlString(documentId)}
        AND section_id = ${sqlString(sectionId)}
      ORDER BY created_at ASC;
    `);

    return rows.map(mapNoteRow);
  }
}
