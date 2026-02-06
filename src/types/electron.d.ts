declare module 'electron' {
  export interface WebContents {
    setWindowOpenHandler(handler: (details: unknown) => { action: 'allow' | 'deny' }): void;
    on(event: 'will-navigate', listener: (event: { preventDefault(): void }, targetUrl: string) => void): void;
    getURL(): string;
  }

  export interface BrowserWindowConstructorOptions {
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    title?: string;
    webPreferences?: Record<string, unknown>;
  }

  export class BrowserWindow {
    constructor(options?: BrowserWindowConstructorOptions);
    loadFile(path: string): Promise<void>;
    static getAllWindows(): BrowserWindow[];
  }

  export interface IpcMain {
    handle(
      channel: string,
      listener: (event: unknown, payload: unknown) => Promise<unknown> | unknown
    ): void;
  }

  export const ipcMain: IpcMain;

  export interface Session {
    setPermissionRequestHandler(
      handler: (webContents: unknown, permission: string, callback: (allow: boolean) => void) => void
    ): void;
    webRequest: {
      onHeadersReceived(
        listener: (
          details: { responseHeaders?: Record<string, string[]> },
          callback: (response: { responseHeaders: Record<string, string[]> }) => void
        ) => void
      ): void;
    };
  }

  export const session: {
    defaultSession: Session;
  };

  export interface App {
    whenReady(): Promise<void>;
    on(event: 'activate', listener: () => void): void;
    on(event: 'window-all-closed', listener: () => void): void;
    on(event: 'web-contents-created', listener: (event: unknown, contents: WebContents) => void): void;
    quit(): void;
    getPath(name: string): string;
  }

  export const app: App;

  export interface ContextBridge {
    exposeInMainWorld(apiKey: string, api: unknown): void;
  }

  export interface IpcRenderer {
    invoke(channel: string, payload: unknown): Promise<unknown>;
  }

  export interface Net {
    isOnline(): boolean;
  }

  export const contextBridge: ContextBridge;
  export const ipcRenderer: IpcRenderer;
  export const net: Net;
}
