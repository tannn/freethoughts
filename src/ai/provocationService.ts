import { randomUUID } from 'node:crypto';
import { SqliteCli } from '../persistence/migrations/sqliteCli.js';
import { AppError } from '../shared/ipc/errors.js';
import { buildDeterministicProvocationContext, type ContextSection } from './contextAssembly.js';
import { AiSettingsRepository } from './settingsRepository.js';
import { DEFAULT_OUTPUT_TOKEN_BUDGET, type ProvocationStyle } from './types.js';
import type { ProvocationGenerationClient } from './generationClient.js';

const sqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`;
interface DbProvocationRow {
  id: string;
  document_id: string;
  section_id: string;
  revision_id: string;
  request_id: string;
  style: ProvocationStyle;
  output_text: string;
  is_active: number;
  created_at: string;
}

interface DbSectionRow {
  id: string;
  heading: string;
  content: string;
  order_index: number;
}

interface DbNoteRow {
  id: string;
  section_id: string | null;
  content: string;
}

export interface ProvocationRecord {
  id: string;
  documentId: string;
  sectionId: string;
  revisionId: string;
  requestId: string;
  style: ProvocationStyle;
  outputText: string;
  isActive: boolean;
  createdAt: string;
}

export interface GenerateProvocationInput {
  requestId: string;
  documentId: string;
  sectionId: string;
  noteId?: string;
  style?: ProvocationStyle;
  confirmReplace?: boolean;
}

const mapProvocationRow = (row: DbProvocationRow): ProvocationRecord => ({
  id: row.id,
  documentId: row.document_id,
  sectionId: row.section_id,
  revisionId: row.revision_id,
  requestId: row.request_id,
  style: row.style,
  outputText: row.output_text,
  isActive: row.is_active === 1,
  createdAt: row.created_at
});

const stylePromptSuffix: Record<ProvocationStyle, string> = {
  skeptical: 'Use a skeptical tone that probes assumptions and asks for falsification evidence.',
  creative: 'Use a creative tone that opens alternative interpretations and unexplored angles.',
  methodological: 'Use a methodological tone that challenges method quality and evidence validity.'
};

const isActiveProvocationUniqueConstraintError = (cause: unknown): boolean => {
  if (!(cause instanceof Error)) {
    return false;
  }

  const message = cause.message.toLowerCase();
  return (
    message.includes('unique constraint failed') &&
    (message.includes('idx_provocations_one_active_per_section_revision') ||
      message.includes('provocations.document_id') ||
      message.includes('provocations.section_id') ||
      message.includes('provocations.revision_id'))
  );
};

export class ProvocationService {
  private readonly sqlite: SqliteCli;

  constructor(
    dbPath: string,
    private readonly settingsRepository: AiSettingsRepository,
    private readonly generationClient: ProvocationGenerationClient,
    private readonly createProvocationId: () => string = () => `prov-${randomUUID()}`
  ) {
    this.sqlite = new SqliteCli(dbPath);
  }

  async generate(input: GenerateProvocationInput): Promise<ProvocationRecord> {
    const documentSettings = this.settingsRepository.getDocumentSettings(input.documentId);
    if (!documentSettings.provocationsEnabled) {
      throw new AppError('E_CONFLICT', 'Provocations are disabled for this document.');
    }

    const currentRevisionId = this.getCurrentRevisionId(input.documentId);
    this.assertSectionInCurrentRevision(input.documentId, input.sectionId, currentRevisionId);

    if (input.noteId) {
      this.assertNoteTarget(input.documentId, input.sectionId, input.noteId);
    }

    const workspaceSettings = this.settingsRepository.getWorkspaceSettings();
    const style = input.style ?? workspaceSettings.defaultProvocationStyle;

    const contextSections = this.listSectionsForRevision(input.documentId, currentRevisionId);
    const context = buildDeterministicProvocationContext(contextSections, input.sectionId);

    const noteSnippet = input.noteId ? this.getNoteSnippet(input.noteId) : null;

    const prompt = this.buildProvocationPrompt({
      style,
      contextText: context.text,
      noteSnippet
    });

    const generated = await this.generationClient.generateProvocation({
      requestId: input.requestId,
      prompt,
      maxOutputTokens: DEFAULT_OUTPUT_TOKEN_BUDGET
    });

    const id = this.createProvocationId();
    this.persistActiveProvocation({
      id,
      documentId: input.documentId,
      sectionId: input.sectionId,
      revisionId: currentRevisionId,
      requestId: input.requestId,
      style,
      outputText: generated.text,
      confirmReplace: input.confirmReplace === true
    });

    const created = this.getById(id);
    if (!created) {
      throw new AppError('E_INTERNAL', 'Failed to load generated provocation');
    }

    return created;
  }

  async regenerate(input: Omit<GenerateProvocationInput, 'confirmReplace'>): Promise<ProvocationRecord> {
    return this.generate({
      ...input,
      confirmReplace: true
    });
  }

  dismiss(documentId: string, sectionId: string): void {
    const currentRevisionId = this.getCurrentRevisionId(documentId);
    const active = this.getActiveInRevision(documentId, sectionId, currentRevisionId);
    if (!active) {
      return;
    }
    this.deleteById(active.id);
  }

  deleteById(provocationId: string): boolean {
    const rows = this.sqlite.queryJson<{ is_active: number }>(`
      SELECT is_active
      FROM provocations
      WHERE id = ${sqlString(provocationId)}
      LIMIT 1;
    `);

    const current = rows[0];
    if (!current) {
      throw new AppError('E_NOT_FOUND', 'Provocation not found', { provocationId });
    }

    if (current.is_active !== 1) {
      return false;
    }

    this.sqlite.exec(`
      UPDATE provocations
      SET is_active = 0
      WHERE id = ${sqlString(provocationId)}
        AND is_active = 1;
    `);
    return true;
  }

  getActive(documentId: string, sectionId: string): ProvocationRecord | null {
    const currentRevisionId = this.getCurrentRevisionId(documentId);
    return this.getActiveInRevision(documentId, sectionId, currentRevisionId);
  }

  listHistory(documentId: string, sectionId: string): ProvocationRecord[] {
    const currentRevisionId = this.getCurrentRevisionId(documentId);
    return this.listActiveInRevision(documentId, sectionId, currentRevisionId);
  }

  cancel(requestId: string): boolean {
    return this.generationClient.cancel(requestId);
  }

  private persistActiveProvocation(input: {
    id: string;
    documentId: string;
    sectionId: string;
    revisionId: string;
    requestId: string;
    style: ProvocationStyle;
    outputText: string;
    confirmReplace: boolean;
  }): void {
    try {
      this.sqlite.exec(`
        BEGIN IMMEDIATE;
        ${
          input.confirmReplace
            ? `UPDATE provocations
        SET is_active = 0
        WHERE document_id = ${sqlString(input.documentId)}
          AND section_id = ${sqlString(input.sectionId)}
          AND revision_id = ${sqlString(input.revisionId)}
          AND is_active = 1;`
            : ''
        }
        INSERT INTO provocations (
          id,
          document_id,
          section_id,
          revision_id,
          request_id,
          style,
          output_text,
          is_active
        ) VALUES (
          ${sqlString(input.id)},
          ${sqlString(input.documentId)},
          ${sqlString(input.sectionId)},
          ${sqlString(input.revisionId)},
          ${sqlString(input.requestId)},
          ${sqlString(input.style)},
          ${sqlString(input.outputText)},
          1
        );
        COMMIT;
      `);
    } catch (error) {
      if (isActiveProvocationUniqueConstraintError(error)) {
        throw new AppError(
          'E_CONFLICT',
          'Active provocation already exists for this section. Confirm replace or dismiss the current one first.',
          {
            documentId: input.documentId,
            sectionId: input.sectionId,
            revisionId: input.revisionId
          }
        );
      }
      throw new AppError('E_INTERNAL', 'Failed to persist generated provocation', {
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private getCurrentRevisionId(documentId: string): string {
    const rows = this.sqlite.queryJson<{ current_revision_id: string | null }>(`
      SELECT current_revision_id
      FROM documents
      WHERE id = ${sqlString(documentId)}
      LIMIT 1;
    `);

    const revisionId = rows[0]?.current_revision_id;
    if (!revisionId) {
      throw new AppError('E_NOT_FOUND', 'Document or current revision not found', { documentId });
    }

    return revisionId;
  }

  private assertSectionInCurrentRevision(
    documentId: string,
    sectionId: string,
    currentRevisionId: string
  ): void {
    const rows = this.sqlite.queryJson<{ id: string }>(`
      SELECT id
      FROM sections
      WHERE id = ${sqlString(sectionId)}
        AND document_id = ${sqlString(documentId)}
        AND revision_id = ${sqlString(currentRevisionId)}
      LIMIT 1;
    `);

    if (!rows[0]) {
      throw new AppError('E_NOT_FOUND', 'Section not found in current revision', {
        documentId,
        sectionId,
        currentRevisionId
      });
    }
  }

  private assertNoteTarget(documentId: string, sectionId: string, noteId: string): void {
    const rows = this.sqlite.queryJson<DbNoteRow>(`
      SELECT id, section_id, content
      FROM notes
      WHERE id = ${sqlString(noteId)}
        AND document_id = ${sqlString(documentId)}
      LIMIT 1;
    `);

    const row = rows[0];
    if (!row) {
      throw new AppError('E_NOT_FOUND', 'Note target not found', { noteId, documentId });
    }

    if (row.section_id !== sectionId) {
      throw new AppError('E_CONFLICT', 'Note target does not belong to target section', {
        noteId,
        expectedSectionId: sectionId,
        actualSectionId: row.section_id
      });
    }
  }

  private getNoteSnippet(noteId: string): string {
    const rows = this.sqlite.queryJson<{ content: string }>(`
      SELECT content
      FROM notes
      WHERE id = ${sqlString(noteId)}
      LIMIT 1;
    `);

    return rows[0]?.content?.trim() ?? '';
  }

  private listSectionsForRevision(documentId: string, revisionId: string): ContextSection[] {
    const rows = this.sqlite.queryJson<DbSectionRow>(`
      SELECT id, heading, content, order_index
      FROM sections
      WHERE document_id = ${sqlString(documentId)}
        AND revision_id = ${sqlString(revisionId)}
      ORDER BY order_index ASC;
    `);

    return rows.map((row) => ({
      id: row.id,
      heading: row.heading,
      content: row.content,
      orderIndex: row.order_index
    }));
  }

  private buildProvocationPrompt(input: {
    style: ProvocationStyle;
    contextText: string;
    noteSnippet: string | null;
  }): string {
    const notePart = input.noteSnippet
      ? `\n\nTarget note:\n${input.noteSnippet}`
      : '\n\nTarget: current section (no specific note).';

    return [
      'You are generating a short provocation to help a reader think critically.',
      stylePromptSuffix[input.style],
      'Do not be authoritative. Ask one concise provocative question or counterpoint.',
      'Maximum length: two sentences.',
      notePart,
      '\n\nContext:\n',
      input.contextText
    ].join('\n');
  }

  private getActiveInRevision(
    documentId: string,
    sectionId: string,
    revisionId: string
  ): ProvocationRecord | null {
    const rows = this.listActiveInRevision(documentId, sectionId, revisionId, 1);
    return rows[0] ?? null;
  }

  private listActiveInRevision(
    documentId: string,
    sectionId: string,
    revisionId: string,
    limit?: number
  ): ProvocationRecord[] {
    const limitClause = limit ? `\n      LIMIT ${limit}` : '';
    const rows = this.sqlite.queryJson<DbProvocationRow>(`
      SELECT id, document_id, section_id, revision_id, request_id, style, output_text, is_active, created_at
      FROM provocations
      WHERE document_id = ${sqlString(documentId)}
        AND section_id = ${sqlString(sectionId)}
        AND revision_id = ${sqlString(revisionId)}
        AND is_active = 1
      ORDER BY created_at DESC, rowid DESC${limitClause};
    `);

    return rows.map((row) => mapProvocationRow(row));
  }

  getById(id: string): ProvocationRecord | null {
    const rows = this.sqlite.queryJson<DbProvocationRow>(`
      SELECT id, document_id, section_id, revision_id, request_id, style, output_text, is_active, created_at
      FROM provocations
      WHERE id = ${sqlString(id)}
      LIMIT 1;
    `);

    return rows[0] ? mapProvocationRow(rows[0]) : null;
  }
}
