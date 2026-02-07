import type { IpcChannel } from '../shared/ipc/channels.js';
import type { IpcEnvelope } from '../shared/ipc/envelope.js';

export interface IpcRendererLike {
  invoke(channel: IpcChannel, payload: unknown): Promise<IpcEnvelope>;
}

export type AuthMode = 'api_key' | 'codex_subscription';

export interface DesktopApi {
  workspace: {
    open(payload: { workspacePath: string }): Promise<IpcEnvelope>;
    create(payload: { workspacePath: string }): Promise<IpcEnvelope>;
    selectPath(payload: { mode: 'open' | 'create' }): Promise<IpcEnvelope>;
  };
  document: {
    import(payload: { sourcePath: string }): Promise<IpcEnvelope>;
    selectSource(payload?: Record<string, never>): Promise<IpcEnvelope>;
    reimport(payload: { documentId: string }): Promise<IpcEnvelope>;
    locate(payload: { documentId: string; sourcePath: string }): Promise<IpcEnvelope>;
  };
  section: {
    list(payload: { documentId: string }): Promise<IpcEnvelope>;
    get(payload: { sectionId: string }): Promise<IpcEnvelope>;
  };
  note: {
    create(payload: {
      documentId: string;
      sectionId: string;
      text: string;
      paragraphOrdinal?: number | null;
      startOffset?: number | null;
      endOffset?: number | null;
      selectedTextExcerpt?: string | null;
    }): Promise<IpcEnvelope>;
    update(payload: { noteId: string; text: string }): Promise<IpcEnvelope>;
    delete(payload: { noteId: string }): Promise<IpcEnvelope>;
    reassign(payload: { noteId: string; targetSectionId: string }): Promise<IpcEnvelope>;
  };
  ai: {
    generateProvocation(payload: {
      requestId: string;
      documentId: string;
      sectionId: string;
      noteId?: string;
      style?: 'skeptical' | 'creative' | 'methodological';
      confirmReplace?: boolean;
      acknowledgeCloudWarning?: boolean;
    }): Promise<IpcEnvelope>;
    cancel(
      payload: { requestId: string } | { documentId: string; sectionId: string; dismissActive: true }
    ): Promise<IpcEnvelope>;
  };
  settings: {
    get(payload?: Record<string, never>): Promise<IpcEnvelope>;
    update(payload: {
      generationModel?: string;
      defaultProvocationStyle?: 'skeptical' | 'creative' | 'methodological';
      openAiApiKey?: string;
      clearOpenAiApiKey?: boolean;
      documentId?: string;
      provocationsEnabled?: boolean;
    }): Promise<IpcEnvelope>;
  };
  network: {
    status(payload?: Record<string, never>): Promise<IpcEnvelope>;
  };
  auth: {
    status(payload?: Record<string, never>): Promise<IpcEnvelope>;
    loginStart(payload?: Record<string, never>): Promise<IpcEnvelope>;
    loginComplete(payload: { correlationState: string }): Promise<IpcEnvelope>;
    logout(payload?: Record<string, never>): Promise<IpcEnvelope>;
    switchMode(payload: { mode: AuthMode }): Promise<IpcEnvelope>;
  };
}

export const createDesktopApi = (ipcRenderer: IpcRendererLike): DesktopApi => ({
  workspace: {
    open: (payload) => ipcRenderer.invoke('workspace.open', payload),
    create: (payload) => ipcRenderer.invoke('workspace.create', payload),
    selectPath: (payload) => ipcRenderer.invoke('workspace.selectPath', payload)
  },
  document: {
    import: (payload) => ipcRenderer.invoke('document.import', payload),
    selectSource: (payload = {}) => ipcRenderer.invoke('document.selectSource', payload),
    reimport: (payload) => ipcRenderer.invoke('document.reimport', payload),
    locate: (payload) => ipcRenderer.invoke('document.locate', payload)
  },
  section: {
    list: (payload) => ipcRenderer.invoke('section.list', payload),
    get: (payload) => ipcRenderer.invoke('section.get', payload)
  },
  note: {
    create: (payload) => ipcRenderer.invoke('note.create', payload),
    update: (payload) => ipcRenderer.invoke('note.update', payload),
    delete: (payload) => ipcRenderer.invoke('note.delete', payload),
    reassign: (payload) => ipcRenderer.invoke('note.reassign', payload)
  },
  ai: {
    generateProvocation: (payload) => ipcRenderer.invoke('ai.generateProvocation', payload),
    cancel: (payload) => ipcRenderer.invoke('ai.cancel', payload)
  },
  settings: {
    get: (payload = {}) => ipcRenderer.invoke('settings.get', payload),
    update: (payload) => ipcRenderer.invoke('settings.update', payload)
  },
  network: {
    status: (payload = {}) => ipcRenderer.invoke('network.status', payload)
  },
  auth: {
    status: (payload = {}) => ipcRenderer.invoke('auth.status', payload),
    loginStart: (payload = {}) => ipcRenderer.invoke('auth.loginStart', payload),
    loginComplete: (payload) => ipcRenderer.invoke('auth.loginComplete', payload),
    logout: (payload = {}) => ipcRenderer.invoke('auth.logout', payload),
    switchMode: (payload) => ipcRenderer.invoke('auth.switchMode', payload)
  }
});
