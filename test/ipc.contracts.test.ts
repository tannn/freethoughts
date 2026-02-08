import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from '../src/shared/ipc/channels.js';
import { ERROR_CODES } from '../src/shared/ipc/errors.js';
import { IPC_SCHEMA_BY_CHANNEL } from '../src/shared/ipc/schemas.js';
import {
  createDefaultBusinessHandlers,
  registerValidatedIpcHandlers,
  type IpcMainListener
} from '../src/main/ipc/registerHandlers.js';

class FakeIpcMain {
  readonly listeners = new Map<string, IpcMainListener>();

  handle(channel: string, listener: IpcMainListener): void {
    this.listeners.set(channel, listener);
  }
}

describe('ipc contracts', () => {
  it('covers every required channel in the allowlist', () => {
    const expected = [
      'workspace.open',
      'workspace.create',
      'document.import',
      'document.reimport',
      'document.locate',
      'section.list',
      'section.get',
      'note.create',
      'note.update',
      'note.delete',
      'note.reassign',
      'ai.generateProvocation',
      'ai.cancel',
      'settings.get',
      'settings.update',
      'network.status',
      'auth.status',
      'auth.loginStart',
      'auth.loginComplete',
      'auth.logout',
      'auth.switchMode'
    ];

    expect(IPC_CHANNELS).toEqual(expected);
    expect(Object.keys(IPC_SCHEMA_BY_CHANNEL).sort()).toEqual([...IPC_CHANNELS].sort());
  });

  it('defines all required error codes', () => {
    expect(ERROR_CODES).toEqual([
      'E_VALIDATION',
      'E_NOT_FOUND',
      'E_CONFLICT',
      'E_OFFLINE',
      'E_PROVIDER',
      'E_UNAUTHORIZED',
      'E_INTERNAL'
    ]);
  });

  it('validates payload before business handler execution', async () => {
    const ipcMain = new FakeIpcMain();
    const handlers = createDefaultBusinessHandlers();
    let invoked = false;

    handlers['note.create'] = () => {
      invoked = true;
      return { noteId: 'n1' };
    };

    registerValidatedIpcHandlers(ipcMain, handlers);
    const listener = ipcMain.listeners.get('note.create');

    expect(listener).toBeDefined();

    const result = await listener!({}, { documentId: 'doc', text: 'missing sectionId' });

    expect(invoked).toBe(false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('E_VALIDATION');
      expect(Array.isArray(result.error.details)).toBe(true);
      expect(result.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'sectionId' })
        ])
      );
    }
  });

  it('returns a success envelope for valid payloads', async () => {
    const ipcMain = new FakeIpcMain();
    const handlers = createDefaultBusinessHandlers();

    handlers['section.get'] = () => ({ sectionId: 's1', text: 'hello' });

    registerValidatedIpcHandlers(ipcMain, handlers);
    const listener = ipcMain.listeners.get('section.get');
    const result = await listener!({}, { sectionId: 's1' });

    expect(result).toEqual({
      ok: true,
      data: { sectionId: 's1', text: 'hello' }
    });
  });

  it('enforces auth.switchMode schema before business handler execution', async () => {
    const ipcMain = new FakeIpcMain();
    const handlers = createDefaultBusinessHandlers();
    let invoked = false;

    handlers['auth.switchMode'] = () => {
      invoked = true;
      return { mode: 'codex_subscription' };
    };

    registerValidatedIpcHandlers(ipcMain, handlers);
    const listener = ipcMain.listeners.get('auth.switchMode');
    const result = await listener!({}, { mode: 'codex' });

    expect(invoked).toBe(false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('E_VALIDATION');
      expect(result.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'mode' })
        ])
      );
    }
  });
});
