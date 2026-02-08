import { randomUUID } from 'node:crypto';
import { SqliteCli } from './migrations/sqliteCli.js';
import { AppError } from '../shared/ipc/errors.js';

const sqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`;

export const AUTH_SESSION_PROVIDER = 'codex_chatgpt' as const;

export const AUTH_SESSION_STATUSES = [
  'signed_out',
  'pending',
  'authenticated',
  'expired',
  'invalid',
  'cancelled'
] as const;

export type AuthSessionStatus = (typeof AUTH_SESSION_STATUSES)[number];

interface AuthSessionRow {
  id: string;
  workspace_id: string;
  provider: string;
  status: string;
  account_label: string | null;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthSessionRecord {
  id: string;
  workspaceId: string;
  provider: typeof AUTH_SESSION_PROVIDER;
  status: AuthSessionStatus;
  accountLabel: string | null;
  lastValidatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const isAuthSessionStatus = (value: string): value is AuthSessionStatus =>
  AUTH_SESSION_STATUSES.includes(value as AuthSessionStatus);

const normalizeRequiredField = (value: string, field: string): string => {
  const normalized = value.trim();
  if (!normalized) {
    throw new AppError('E_VALIDATION', `${field} is required`, { field });
  }
  return normalized;
};

const normalizeAccountLabel = (value: string | null): string | null => {
  if (value === null) {
    return null;
  }
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
};

const normalizeIsoTimestampOrNull = (value: string | null, field: string): string | null => {
  if (value === null) {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new AppError('E_VALIDATION', `${field} cannot be empty`, { field });
  }
  if (Number.isNaN(Date.parse(normalized))) {
    throw new AppError('E_VALIDATION', `${field} must be a valid timestamp`, {
      field,
      value: normalized
    });
  }
  return normalized;
};

const mapRow = (row: AuthSessionRow): AuthSessionRecord => {
  if (row.provider !== AUTH_SESSION_PROVIDER) {
    throw new AppError('E_INTERNAL', 'Invalid auth session provider in persistence');
  }
  if (!isAuthSessionStatus(row.status)) {
    throw new AppError('E_INTERNAL', 'Invalid auth session status in persistence');
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    provider: AUTH_SESSION_PROVIDER,
    status: row.status,
    accountLabel: row.account_label,
    lastValidatedAt: row.last_validated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

export interface UpsertCodexSessionInput {
  status: AuthSessionStatus;
  accountLabel?: string | null;
  lastValidatedAt?: string | null;
}

export class AuthSessionRepository {
  private readonly sqlite: SqliteCli;

  constructor(dbPath: string) {
    this.sqlite = new SqliteCli(dbPath);
  }

  getCodexSession(workspaceId: string): AuthSessionRecord | null {
    const normalizedWorkspaceId = normalizeRequiredField(workspaceId, 'workspaceId');
    const rows = this.sqlite.queryJson<AuthSessionRow>(`
      SELECT id, workspace_id, provider, status, account_label, last_validated_at, created_at, updated_at
      FROM auth_sessions
      WHERE workspace_id = ${sqlString(normalizedWorkspaceId)}
        AND provider = ${sqlString(AUTH_SESSION_PROVIDER)}
      LIMIT 1;
    `);

    return rows[0] ? mapRow(rows[0]) : null;
  }

  upsertCodexSession(workspaceId: string, input: UpsertCodexSessionInput): AuthSessionRecord {
    const normalizedWorkspaceId = normalizeRequiredField(workspaceId, 'workspaceId');
    this.requireWorkspaceExists(normalizedWorkspaceId);

    const status = normalizeRequiredField(input.status, 'status');
    if (!isAuthSessionStatus(status)) {
      throw new AppError('E_VALIDATION', 'Invalid auth session status', {
        field: 'status',
        value: status
      });
    }

    const current = this.getCodexSession(normalizedWorkspaceId);
    const nextAccountLabel =
      input.accountLabel !== undefined
        ? normalizeAccountLabel(input.accountLabel)
        : (current?.accountLabel ?? null);
    const nextLastValidatedAt =
      input.lastValidatedAt !== undefined
        ? normalizeIsoTimestampOrNull(input.lastValidatedAt, 'lastValidatedAt')
        : (current?.lastValidatedAt ?? null);
    const sessionId = current?.id ?? `auth-${randomUUID()}`;

    this.sqlite.exec(`
      INSERT INTO auth_sessions (
        id,
        workspace_id,
        provider,
        status,
        account_label,
        last_validated_at
      ) VALUES (
        ${sqlString(sessionId)},
        ${sqlString(normalizedWorkspaceId)},
        ${sqlString(AUTH_SESSION_PROVIDER)},
        ${sqlString(status)},
        ${nextAccountLabel === null ? 'NULL' : sqlString(nextAccountLabel)},
        ${nextLastValidatedAt === null ? 'NULL' : sqlString(nextLastValidatedAt)}
      )
      ON CONFLICT(workspace_id, provider) DO UPDATE SET
        status = excluded.status,
        account_label = excluded.account_label,
        last_validated_at = excluded.last_validated_at,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now');
    `);

    return this.requireCodexSession(normalizedWorkspaceId);
  }

  clearCodexSession(workspaceId: string): void {
    const normalizedWorkspaceId = normalizeRequiredField(workspaceId, 'workspaceId');
    this.requireWorkspaceExists(normalizedWorkspaceId);

    this.sqlite.exec(`
      DELETE FROM auth_sessions
      WHERE workspace_id = ${sqlString(normalizedWorkspaceId)}
        AND provider = ${sqlString(AUTH_SESSION_PROVIDER)};
    `);
  }

  private requireCodexSession(workspaceId: string): AuthSessionRecord {
    const session = this.getCodexSession(workspaceId);
    if (!session) {
      throw new AppError('E_INTERNAL', 'Auth session persistence returned missing row', { workspaceId });
    }
    return session;
  }

  private requireWorkspaceExists(workspaceId: string): void {
    const rows = this.sqlite.queryJson<{ id: string }>(`
      SELECT id
      FROM workspaces
      WHERE id = ${sqlString(workspaceId)}
      LIMIT 1;
    `);

    if (!rows[0]) {
      throw new AppError('E_NOT_FOUND', 'Workspace not found', { workspaceId });
    }
  }
}
