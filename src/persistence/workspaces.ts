import { randomUUID } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { parse, resolve } from 'node:path';
import { SqliteCli } from './migrations/sqliteCli.js';
import { AppError } from '../shared/ipc/errors.js';

const sqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`;

interface WorkspaceRow {
  id: string;
  root_path: string;
  cloud_warning_acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceRecord {
  id: string;
  rootPath: string;
  cloudWarningAcknowledgedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const mapWorkspaceRow = (row: WorkspaceRow): WorkspaceRecord => ({
  id: row.id,
  rootPath: row.root_path,
  cloudWarningAcknowledgedAt: row.cloud_warning_acknowledged_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const trimTrailingSeparators = (pathValue: string): string => {
  const rootPath = parse(pathValue).root;
  if (pathValue === rootPath) {
    return pathValue;
  }
  return pathValue.replace(/[\\/]+$/, '');
};

const isNotFoundError = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');

const normalizeWorkspacePath = (
  workspacePath: string,
  options: { requireExistingDirectory: boolean }
): string => {
  const trimmed = workspacePath.trim();
  if (!trimmed) {
    throw new AppError('E_VALIDATION', 'Workspace path is required', { field: 'workspacePath' });
  }

  const normalizedPath = trimTrailingSeparators(resolve(trimmed));

  try {
    const stats = statSync(normalizedPath);
    if (!stats.isDirectory()) {
      throw new AppError('E_VALIDATION', 'Workspace path must reference a directory', {
        workspacePath: normalizedPath
      });
    }
    return trimTrailingSeparators(realpathSync.native(normalizedPath));
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (isNotFoundError(error)) {
      if (options.requireExistingDirectory) {
        throw new AppError('E_NOT_FOUND', 'Workspace folder not found', {
          workspacePath: normalizedPath
        });
      }
      return normalizedPath;
    }

    throw new AppError('E_INTERNAL', 'Unable to access workspace path', {
      workspacePath: normalizedPath
    });
  }
};

export class WorkspaceRepository {
  private readonly sqlite: SqliteCli;

  constructor(dbPath: string) {
    this.sqlite = new SqliteCli(dbPath);
  }

  createWorkspace(rootPath: string): WorkspaceRecord {
    const normalizedPath = normalizeWorkspacePath(rootPath, { requireExistingDirectory: false });
    const existing = this.getWorkspaceByNormalizedRootPath(normalizedPath);
    if (existing) {
      throw new AppError('E_CONFLICT', 'Workspace already exists', {
        rootPath: normalizedPath,
        workspaceId: existing.id
      });
    }

    return this.insertWorkspace(normalizedPath);
  }

  openWorkspace(rootPath: string): WorkspaceRecord {
    const normalizedPath = normalizeWorkspacePath(rootPath, { requireExistingDirectory: true });
    const existing = this.getWorkspaceByNormalizedRootPath(normalizedPath);
    if (existing) {
      this.markWorkspaceAsOpened(existing.id);
      return this.requireWorkspace(existing.id);
    }

    return this.insertWorkspace(normalizedPath);
  }

  getWorkspaceById(workspaceId: string): WorkspaceRecord | null {
    const normalizedWorkspaceId = workspaceId.trim();
    if (!normalizedWorkspaceId) {
      throw new AppError('E_VALIDATION', 'Workspace id is required', { field: 'workspaceId' });
    }

    const rows = this.sqlite.queryJson<WorkspaceRow>(`
      SELECT id, root_path, cloud_warning_acknowledged_at, created_at, updated_at
      FROM workspaces
      WHERE id = ${sqlString(normalizedWorkspaceId)}
      LIMIT 1;
    `);

    return rows[0] ? mapWorkspaceRow(rows[0]) : null;
  }

  getWorkspaceByRootPath(rootPath: string): WorkspaceRecord | null {
    return this.getWorkspaceByNormalizedRootPath(
      normalizeWorkspacePath(rootPath, { requireExistingDirectory: false })
    );
  }

  listWorkspaces(): WorkspaceRecord[] {
    const rows = this.sqlite.queryJson<WorkspaceRow>(`
      SELECT id, root_path, cloud_warning_acknowledged_at, created_at, updated_at
      FROM workspaces
      ORDER BY updated_at DESC, created_at DESC, id ASC;
    `);

    return rows.map(mapWorkspaceRow);
  }

  acknowledgeCloudWarning(workspaceId: string): WorkspaceRecord {
    const workspace = this.getWorkspaceById(workspaceId);
    if (!workspace) {
      throw new AppError('E_NOT_FOUND', 'Workspace not found', { workspaceId });
    }

    this.sqlite.exec(`
      UPDATE workspaces
      SET
        cloud_warning_acknowledged_at = COALESCE(
          cloud_warning_acknowledged_at,
          strftime('%Y-%m-%dT%H:%M:%fZ','now')
        ),
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ${sqlString(workspace.id)};
    `);

    return this.requireWorkspace(workspace.id);
  }

  private insertWorkspace(rootPath: string): WorkspaceRecord {
    const workspaceId = randomUUID();
    this.sqlite.exec(`
      INSERT INTO workspaces (id, root_path)
      VALUES (
        ${sqlString(workspaceId)},
        ${sqlString(rootPath)}
      );
    `);
    return this.requireWorkspace(workspaceId);
  }

  private markWorkspaceAsOpened(workspaceId: string): void {
    this.sqlite.exec(`
      UPDATE workspaces
      SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ${sqlString(workspaceId)};
    `);
  }

  private getWorkspaceByNormalizedRootPath(rootPath: string): WorkspaceRecord | null {
    const exactMatch = this.getWorkspaceByRawRootPath(rootPath);
    if (exactMatch) {
      return exactMatch;
    }

    const rows = this.sqlite.queryJson<WorkspaceRow>(`
      SELECT id, root_path, cloud_warning_acknowledged_at, created_at, updated_at
      FROM workspaces
      ORDER BY created_at ASC, id ASC;
    `);

    for (const row of rows) {
      let normalizedRowPath = row.root_path;
      try {
        normalizedRowPath = normalizeWorkspacePath(row.root_path, { requireExistingDirectory: false });
      } catch {
        normalizedRowPath = row.root_path;
      }

      if (normalizedRowPath !== rootPath) {
        continue;
      }

      if (row.root_path !== rootPath) {
        this.sqlite.exec(`
          UPDATE workspaces
          SET
            root_path = ${sqlString(rootPath)},
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id = ${sqlString(row.id)};
        `);
        return this.requireWorkspace(row.id);
      }

      return mapWorkspaceRow(row);
    }

    return null;
  }

  private getWorkspaceByRawRootPath(rootPath: string): WorkspaceRecord | null {
    const rows = this.sqlite.queryJson<WorkspaceRow>(`
      SELECT id, root_path, cloud_warning_acknowledged_at, created_at, updated_at
      FROM workspaces
      WHERE root_path = ${sqlString(rootPath)}
      LIMIT 1;
    `);

    return rows[0] ? mapWorkspaceRow(rows[0]) : null;
  }

  private requireWorkspace(workspaceId: string): WorkspaceRecord {
    const workspace = this.getWorkspaceById(workspaceId);
    if (!workspace) {
      throw new AppError('E_INTERNAL', 'Workspace persistence returned missing row', { workspaceId });
    }
    return workspace;
  }
}
