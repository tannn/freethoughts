import { MIGRATIONS } from './definitions.js';
import { SqliteCli } from './sqliteCli.js';

export const applyAllMigrations = (dbPath: string): void => {
  const sqlite = new SqliteCli(dbPath);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);

  const applied = sqlite.queryJson<{ version: number }>('SELECT version FROM schema_migrations');
  const appliedSet = new Set(applied.map((row) => row.version));

  for (const migration of MIGRATIONS) {
    if (appliedSet.has(migration.version)) {
      continue;
    }
    const migrationName = migration.name.replaceAll("'", "''");
    sqlite.exec(`
      ${migration.upSql}
      INSERT INTO schema_migrations(version, name) VALUES (${migration.version}, '${migrationName}');
    `);
  }
};

export const rollbackAllMigrations = (dbPath: string): void => {
  const sqlite = new SqliteCli(dbPath);

  for (const migration of [...MIGRATIONS].reverse()) {
    sqlite.exec(migration.downSql);
  }
};

export const listTables = (dbPath: string): string[] => {
  const sqlite = new SqliteCli(dbPath);
  const rows = sqlite.queryJson<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );

  return rows.map((row) => row.name);
};

export const listColumns = (dbPath: string, tableName: string): string[] => {
  const sqlite = new SqliteCli(dbPath);
  const rows = sqlite.queryJson<{ name: string }>(`PRAGMA table_info(${tableName});`);
  return rows.map((row) => row.name);
};
