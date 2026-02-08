import { createDesktopApi, type IpcRendererLike } from './api.js';

export const PRELOAD_API_KEY = 'tft';

export interface ContextBridgeLike {
  exposeInMainWorld(apiKey: string, api: unknown): void;
}

export const exposeDesktopApi = (
  contextBridge: ContextBridgeLike,
  ipcRenderer: IpcRendererLike
): void => {
  const api = createDesktopApi(ipcRenderer);
  contextBridge.exposeInMainWorld(PRELOAD_API_KEY, api);
};
