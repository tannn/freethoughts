import { AppError } from '../shared/ipc/errors.js';
import { SqliteCli } from '../persistence/migrations/sqliteCli.js';
import {
  DEFAULT_AI_SETTINGS,
  PROVOCATION_STYLES,
  type DocumentAiSettings,
  type ProvocationStyle,
  type WorkspaceAiSettings
} from './types.js';

const sqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`;

const isProvocationStyle = (value: string): value is ProvocationStyle => {
  return PROVOCATION_STYLES.includes(value as ProvocationStyle);
};

interface WorkspaceSettingsRow {
  generation_model: string;
  default_provocation_style: string;
}

interface DocumentSettingsRow {
  provocations_enabled: number;
}

export class AiSettingsRepository {
  private readonly sqlite: SqliteCli;

  constructor(dbPath: string) {
    this.sqlite = new SqliteCli(dbPath);
  }

  getWorkspaceSettings(): WorkspaceAiSettings {
    const rows = this.sqlite.queryJson<WorkspaceSettingsRow>(`
      SELECT generation_model, default_provocation_style
      FROM workspace_settings
      WHERE id = 1
      LIMIT 1;
    `);

    const row = rows[0];
    if (!row) {
      return DEFAULT_AI_SETTINGS;
    }

    if (!isProvocationStyle(row.default_provocation_style)) {
      throw new AppError('E_INTERNAL', 'Invalid workspace provocation style in persistence');
    }

    return {
      generationModel: row.generation_model,
      defaultProvocationStyle: row.default_provocation_style
    };
  }

  updateWorkspaceSettings(patch: Partial<WorkspaceAiSettings>): WorkspaceAiSettings {
    const current = this.getWorkspaceSettings();

    const nextGenerationModel = patch.generationModel ?? current.generationModel;
    const nextStyle = patch.defaultProvocationStyle ?? current.defaultProvocationStyle;

    if (!isProvocationStyle(nextStyle)) {
      throw new AppError('E_VALIDATION', 'Invalid provocation style', {
        field: 'defaultProvocationStyle',
        value: nextStyle
      });
    }

    if (!nextGenerationModel.trim()) {
      throw new AppError('E_VALIDATION', 'Generation model is required', {
        field: 'generationModel'
      });
    }

    this.sqlite.exec(`
      INSERT INTO workspace_settings (id, generation_model, default_provocation_style)
      VALUES (
        1,
        ${sqlString(nextGenerationModel.trim())},
        ${sqlString(nextStyle)}
      )
      ON CONFLICT(id) DO UPDATE SET
        generation_model = excluded.generation_model,
        default_provocation_style = excluded.default_provocation_style,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now');
    `);

    return this.getWorkspaceSettings();
  }

  getDocumentSettings(documentId: string): DocumentAiSettings {
    const rows = this.sqlite.queryJson<DocumentSettingsRow>(`
      SELECT provocations_enabled
      FROM document_settings
      WHERE document_id = ${sqlString(documentId)}
      LIMIT 1;
    `);

    if (!rows[0]) {
      return {
        documentId,
        provocationsEnabled: true
      };
    }

    return {
      documentId,
      provocationsEnabled: rows[0].provocations_enabled === 1
    };
  }

  updateDocumentSettings(
    documentId: string,
    patch: Partial<Omit<DocumentAiSettings, 'documentId'>>
  ): DocumentAiSettings {
    const docRows = this.sqlite.queryJson<{ id: string }>(`
      SELECT id
      FROM documents
      WHERE id = ${sqlString(documentId)}
      LIMIT 1;
    `);

    if (!docRows[0]) {
      throw new AppError('E_NOT_FOUND', 'Document not found', { documentId });
    }

    const current = this.getDocumentSettings(documentId);
    const nextProvocationsEnabled = patch.provocationsEnabled ?? current.provocationsEnabled;

    this.sqlite.exec(`
      INSERT INTO document_settings (document_id, provocations_enabled)
      VALUES (${sqlString(documentId)}, ${nextProvocationsEnabled ? 1 : 0})
      ON CONFLICT(document_id) DO UPDATE SET
        provocations_enabled = excluded.provocations_enabled,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now');
    `);

    return this.getDocumentSettings(documentId);
  }
}
