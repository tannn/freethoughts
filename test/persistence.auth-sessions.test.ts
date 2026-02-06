import { describe, expect, it } from 'vitest';
import { AuthSessionRepository } from '../src/persistence/authSessions.js';
import { WorkspaceRepository } from '../src/persistence/workspaces.js';
import { AppError } from '../src/shared/ipc/errors.js';
import { createTempDb, createTempDir } from './helpers/db.js';

describe('auth session metadata persistence', () => {
  it('persists codex auth metadata across repository restarts', () => {
    const { dbPath } = createTempDb();
    const workspaces = new WorkspaceRepository(dbPath);
    const workspace = workspaces.openWorkspace(createTempDir());

    const sessions = new AuthSessionRepository(dbPath);
    const saved = sessions.upsertCodexSession(workspace.id, {
      status: 'authenticated',
      accountLabel: 'reader@example.com',
      lastValidatedAt: '2026-02-06T10:30:00.000Z'
    });

    expect(saved.workspaceId).toBe(workspace.id);
    expect(saved.status).toBe('authenticated');
    expect(saved.accountLabel).toBe('reader@example.com');
    expect(saved.lastValidatedAt).toBe('2026-02-06T10:30:00.000Z');

    const restarted = new AuthSessionRepository(dbPath);
    const loaded = restarted.getCodexSession(workspace.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.status).toBe('authenticated');
    expect(loaded?.accountLabel).toBe('reader@example.com');
    expect(loaded?.lastValidatedAt).toBe('2026-02-06T10:30:00.000Z');
  });

  it('updates status deterministically while preserving omitted metadata fields', () => {
    const { dbPath } = createTempDb();
    const workspace = new WorkspaceRepository(dbPath).openWorkspace(createTempDir());
    const sessions = new AuthSessionRepository(dbPath);

    sessions.upsertCodexSession(workspace.id, {
      status: 'authenticated',
      accountLabel: 'person@example.com',
      lastValidatedAt: '2026-02-06T11:00:00.000Z'
    });

    const updated = sessions.upsertCodexSession(workspace.id, {
      status: 'expired'
    });

    expect(updated.status).toBe('expired');
    expect(updated.accountLabel).toBe('person@example.com');
    expect(updated.lastValidatedAt).toBe('2026-02-06T11:00:00.000Z');
  });

  it('clears codex auth metadata for a workspace', () => {
    const { dbPath } = createTempDb();
    const workspace = new WorkspaceRepository(dbPath).openWorkspace(createTempDir());
    const sessions = new AuthSessionRepository(dbPath);

    sessions.upsertCodexSession(workspace.id, {
      status: 'pending'
    });
    expect(sessions.getCodexSession(workspace.id)?.status).toBe('pending');

    sessions.clearCodexSession(workspace.id);
    expect(sessions.getCodexSession(workspace.id)).toBeNull();
  });

  it('validates workspace existence and auth metadata payloads', () => {
    const { dbPath } = createTempDb();
    const sessions = new AuthSessionRepository(dbPath);

    let missingWorkspaceError: unknown;
    try {
      sessions.upsertCodexSession('missing-workspace', { status: 'pending' });
    } catch (error) {
      missingWorkspaceError = error;
    }
    expect(missingWorkspaceError).toBeInstanceOf(AppError);
    expect((missingWorkspaceError as AppError).code).toBe('E_NOT_FOUND');

    const workspace = new WorkspaceRepository(dbPath).openWorkspace(createTempDir());

    let invalidStatusError: unknown;
    try {
      sessions.upsertCodexSession(workspace.id, { status: 'unknown' as never });
    } catch (error) {
      invalidStatusError = error;
    }
    expect(invalidStatusError).toBeInstanceOf(AppError);
    expect((invalidStatusError as AppError).code).toBe('E_VALIDATION');

    let invalidTimestampError: unknown;
    try {
      sessions.upsertCodexSession(workspace.id, {
        status: 'pending',
        lastValidatedAt: 'not-a-timestamp'
      });
    } catch (error) {
      invalidTimestampError = error;
    }
    expect(invalidTimestampError).toBeInstanceOf(AppError);
    expect((invalidTimestampError as AppError).code).toBe('E_VALIDATION');
  });
});
