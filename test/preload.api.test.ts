import { describe, expect, it } from 'vitest';
import { createDesktopApi } from '../src/preload/api.js';
import { PRELOAD_API_KEY, exposeDesktopApi } from '../src/preload/index.js';
import type { IpcChannel } from '../src/shared/ipc/channels.js';
import type { IpcEnvelope } from '../src/shared/ipc/envelope.js';

describe('preload api boundary', () => {
  it('exposes exactly one API object through contextBridge', () => {
    const calls: Array<{ apiKey: string; api: unknown }> = [];
    const contextBridge = {
      exposeInMainWorld(apiKey: string, api: unknown) {
        calls.push({ apiKey, api });
      }
    };

    const ipcRenderer = {
      invoke: async (): Promise<IpcEnvelope> => ({ ok: true, data: null })
    };

    exposeDesktopApi(contextBridge, ipcRenderer);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.apiKey).toBe(PRELOAD_API_KEY);
    expect(Object.keys((calls[0]?.api as object) ?? {})).toEqual([
      'workspace',
      'document',
      'section',
      'note',
      'ai',
      'settings',
      'network'
    ]);
  });

  it('routes renderer calls through allowlisted IPC channels', async () => {
    const seen: Array<{ channel: IpcChannel; payload: unknown }> = [];

    const ipcRenderer = {
      invoke: async (channel: IpcChannel, payload: unknown): Promise<IpcEnvelope> => {
        seen.push({ channel, payload });
        return { ok: true, data: { channel } };
      }
    };

    const api = createDesktopApi(ipcRenderer);

    const response = await api.note.create({
      documentId: 'd1',
      sectionId: 's1',
      text: 'note'
    });

    expect(response).toEqual({ ok: true, data: { channel: 'note.create' } });
    expect(seen).toEqual([
      {
        channel: 'note.create',
        payload: { documentId: 'd1', sectionId: 's1', text: 'note' }
      }
    ]);
  });
});
