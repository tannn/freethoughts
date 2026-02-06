export interface Migration {
  version: number;
  name: string;
  upSql: string;
  downSql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_revision_schema',
    upSql: `
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        source_path TEXT NOT NULL,
        source_size INTEGER NOT NULL,
        source_mtime INTEGER NOT NULL,
        source_sha256 TEXT NOT NULL,
        current_revision_id TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE IF NOT EXISTS document_revisions (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        revision_number INTEGER NOT NULL,
        source_path TEXT NOT NULL,
        source_size INTEGER NOT NULL,
        source_mtime INTEGER NOT NULL,
        source_sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        UNIQUE(document_id, revision_number)
      );

      CREATE TABLE IF NOT EXISTS sections (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        anchor_key TEXT NOT NULL,
        heading TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        order_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY (revision_id) REFERENCES document_revisions(id) ON DELETE CASCADE,
        UNIQUE(revision_id, anchor_key)
      );

      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        section_id TEXT,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS note_reassignment_queue (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL UNIQUE,
        document_id TEXT NOT NULL,
        previous_revision_id TEXT NOT NULL,
        previous_section_id TEXT,
        previous_anchor_key TEXT,
        previous_heading TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        resolved_at TEXT,
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY (previous_revision_id) REFERENCES document_revisions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS provocations (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        section_id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        style TEXT NOT NULL,
        output_text TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
        FOREIGN KEY (revision_id) REFERENCES document_revisions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sections_revision_id ON sections(revision_id);
      CREATE INDEX IF NOT EXISTS idx_notes_document_id ON notes(document_id);
      CREATE INDEX IF NOT EXISTS idx_note_reassignment_open ON note_reassignment_queue(document_id, status);
      CREATE INDEX IF NOT EXISTS idx_provocations_revision_id ON provocations(revision_id);
    `,
    downSql: `
      DROP TABLE IF EXISTS provocations;
      DROP TABLE IF EXISTS note_reassignment_queue;
      DROP TABLE IF EXISTS notes;
      DROP TABLE IF EXISTS sections;
      DROP TABLE IF EXISTS document_revisions;
      DROP TABLE IF EXISTS documents;
      DROP TABLE IF EXISTS schema_migrations;
    `
  },
  {
    version: 2,
    name: 'ai_settings_tables',
    upSql: `
      CREATE TABLE IF NOT EXISTS workspace_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        generation_model TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
        default_provocation_style TEXT NOT NULL DEFAULT 'skeptical' CHECK (
          default_provocation_style IN ('skeptical', 'creative', 'methodological')
        ),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      INSERT OR IGNORE INTO workspace_settings (id) VALUES (1);

      CREATE TABLE IF NOT EXISTS document_settings (
        document_id TEXT PRIMARY KEY,
        provocations_enabled INTEGER NOT NULL DEFAULT 1 CHECK (provocations_enabled IN (0, 1)),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );
    `,
    downSql: `
      DROP TABLE IF EXISTS document_settings;
      DROP TABLE IF EXISTS workspace_settings;
    `
  },
  {
    version: 3,
    name: 'provocation_active_unique_index',
    upSql: `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_provocations_one_active_per_section_revision
      ON provocations(document_id, section_id, revision_id)
      WHERE is_active = 1;
    `,
    downSql: `
      DROP INDEX IF EXISTS idx_provocations_one_active_per_section_revision;
    `
  }
];
