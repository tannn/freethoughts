import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererLike } from './api.js';
import { exposeDesktopApi } from './index.js';

exposeDesktopApi(contextBridge, ipcRenderer as unknown as IpcRendererLike);
