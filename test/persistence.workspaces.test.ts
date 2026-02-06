import { mkdirSync, realpathSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkspaceRepository } from '../src/persistence/workspaces.js';
import { AppError } from '../src/shared/ipc/errors.js';
import { createTempDb, createTempDir } from './helpers/db.js';

describe('workspace lifecycle persistence', () => {
  it('persists create/open workspace state across repository restarts', () => {
    const { dbPath } = createTempDb();
    const first = new WorkspaceRepository(dbPath);
    const workspaceDir = createTempDir();

    const created = first.createWorkspace(workspaceDir);
    expect(created.rootPath).toBe(realpathSync.native(resolve(workspaceDir)));
    expect(created.cloudWarningAcknowledgedAt).toBeNull();

    const restarted = new WorkspaceRepository(dbPath);
    const opened = restarted.openWorkspace(`${workspaceDir}/`);

    expect(opened.id).toBe(created.id);
    expect(opened.rootPath).toBe(created.rootPath);
    expect(opened.cloudWarningAcknowledgedAt).toBeNull();

    const listed = restarted.listWorkspaces();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(created.id);
  });

  it('stores first cloud-warning acknowledgment once per workspace and keeps other workspaces unacknowledged', () => {
    const { dbPath } = createTempDb();
    const repository = new WorkspaceRepository(dbPath);
    const workspaceDirA = createTempDir();
    const workspaceDirB = createTempDir();

    const workspaceA = repository.openWorkspace(workspaceDirA);
    const workspaceB = repository.openWorkspace(workspaceDirB);

    const acknowledged = repository.acknowledgeCloudWarning(workspaceA.id);
    expect(acknowledged.cloudWarningAcknowledgedAt).not.toBeNull();

    const acknowledgedAgain = repository.acknowledgeCloudWarning(workspaceA.id);
    expect(acknowledgedAgain.cloudWarningAcknowledgedAt).toBe(acknowledged.cloudWarningAcknowledgedAt);

    const stateB = repository.getWorkspaceById(workspaceB.id);
    expect(stateB?.cloudWarningAcknowledgedAt).toBeNull();

    const restarted = new WorkspaceRepository(dbPath);
    expect(restarted.getWorkspaceById(workspaceA.id)?.cloudWarningAcknowledgedAt).toBe(
      acknowledged.cloudWarningAcknowledgedAt
    );
    expect(restarted.getWorkspaceById(workspaceB.id)?.cloudWarningAcknowledgedAt).toBeNull();
  });

  it('prevents duplicate workspace creation for the same root path', () => {
    const { dbPath } = createTempDb();
    const repository = new WorkspaceRepository(dbPath);
    const workspaceDir = createTempDir();

    repository.createWorkspace(workspaceDir);

    let thrown: unknown;
    try {
      repository.createWorkspace(`${workspaceDir}/`);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe('E_CONFLICT');
  });

  it('deduplicates workspace opens for symlink and canonical directory paths', () => {
    const { dbPath } = createTempDb();
    const repository = new WorkspaceRepository(dbPath);
    const parent = createTempDir();
    const realPath = join(parent, 'workspace-real');
    const linkPath = join(parent, 'workspace-link');

    mkdirSync(realPath);
    symlinkSync(realPath, linkPath, process.platform === 'win32' ? 'junction' : 'dir');

    const fromLink = repository.openWorkspace(linkPath);
    const fromReal = repository.openWorkspace(realPath);

    expect(fromReal.id).toBe(fromLink.id);
    expect(fromReal.rootPath).toBe(realpathSync.native(resolve(realPath)));
    expect(repository.listWorkspaces()).toHaveLength(1);
  });

  it('rejects opening workspace folders that do not exist', () => {
    const { dbPath } = createTempDb();
    const repository = new WorkspaceRepository(dbPath);
    const missingWorkspaceDir = join(createTempDir(), 'missing-workspace');

    let thrown: unknown;
    try {
      repository.openWorkspace(missingWorkspaceDir);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe('E_NOT_FOUND');
  });
});
