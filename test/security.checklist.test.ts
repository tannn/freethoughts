import { describe, expect, it } from 'vitest';
import {
  CONTENT_SECURITY_POLICY,
  MAIN_WINDOW_WEB_PREFERENCES,
  isTrustedNavigation,
  shouldAllowPermission,
  shouldAllowWindowOpen
} from '../src/main/window/security.js';
import { createDefaultBusinessHandlers, registerValidatedIpcHandlers } from '../src/main/ipc/index.js';
import { createDesktopApi } from '../src/preload/api.js';
import { PRELOAD_API_KEY, exposeDesktopApi } from '../src/preload/index.js';
import { IPC_CHANNELS, type IpcChannel } from '../src/shared/ipc/channels.js';
import type { IpcEnvelope } from '../src/shared/ipc/envelope.js';

class FakeIpcMain {
  readonly listeners = new Map<string, (event: unknown, payload: unknown) => Promise<IpcEnvelope>>();

  handle(channel: string, listener: (event: unknown, payload: unknown) => Promise<IpcEnvelope>): void {
    this.listeners.set(channel, listener);
  }
}

describe('phase 5 security checklist (FR-060 to FR-069)', () => {
  it('enforces required renderer webPreferences flags (FR-060, FR-061, FR-062, FR-063, FR-064)', () => {
    expect(MAIN_WINDOW_WEB_PREFERENCES).toMatchObject({
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      enableRemoteModule: false
    });
  });

  it('exposes renderer API only via preload contextBridge boundary (FR-065)', () => {
    const exposed: Array<{ apiKey: string; api: unknown }> = [];
    const contextBridge = {
      exposeInMainWorld(apiKey: string, api: unknown) {
        exposed.push({ apiKey, api });
      }
    };

    const ipcRenderer = {
      invoke: async (): Promise<IpcEnvelope> => ({ ok: true, data: null })
    };

    exposeDesktopApi(contextBridge, ipcRenderer);
    expect(exposed).toHaveLength(1);
    expect(exposed[0]?.apiKey).toBe(PRELOAD_API_KEY);
    expect(Object.keys((exposed[0]?.api as object) ?? {})).toEqual([
      'workspace',
      'document',
      'section',
      'note',
      'ai',
      'settings',
      'network'
    ]);

    const api = createDesktopApi(ipcRenderer);
    expect((api as unknown as Record<string, unknown>).require).toBeUndefined();
    expect((api as unknown as Record<string, unknown>).process).toBeUndefined();
  });

  it('restricts IPC to allowlisted channels and validates payloads at runtime (FR-066)', async () => {
    const ipcMain = new FakeIpcMain();
    const handlers = createDefaultBusinessHandlers();
    handlers['note.create'] = () => ({ noteId: 'note-1' });

    registerValidatedIpcHandlers(ipcMain, handlers);
    expect([...ipcMain.listeners.keys()]).toEqual(IPC_CHANNELS);

    const invalidPayloadResult = await ipcMain.listeners.get('note.create')!({}, {
      documentId: 'doc-1',
      sectionId: 'sec-1',
      text: 'text',
      extraField: 'blocked'
    });
    expect(invalidPayloadResult.ok).toBe(false);
    if (!invalidPayloadResult.ok) {
      expect(invalidPayloadResult.error.code).toBe('E_VALIDATION');
    }

    const seen: Array<{ channel: IpcChannel; payload: unknown }> = [];
    const api = createDesktopApi({
      invoke: async (channel: IpcChannel, payload: unknown): Promise<IpcEnvelope> => {
        seen.push({ channel, payload });
        return { ok: true, data: null };
      }
    });

    await api.ai.cancel({ requestId: 'req-1' });
    expect(seen).toEqual([{ channel: 'ai.cancel', payload: { requestId: 'req-1' } }]);
  });

  it('defines strict CSP defaults with narrow connect-src (FR-067)', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'self' https://api.openai.com");
  });

  it('denies untrusted navigation, window creation, and permissions by default (FR-068, FR-069)', () => {
    expect(isTrustedNavigation('https://app.local/reader', 'https://app.local/index.html')).toBe(true);
    expect(isTrustedNavigation('https://malicious.example/phish', 'https://app.local/index.html')).toBe(false);
    expect(shouldAllowWindowOpen()).toBe(false);
    expect(shouldAllowPermission()).toBe(false);
  });
});
