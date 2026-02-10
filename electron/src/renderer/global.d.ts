import type { DesktopApi } from '../preload/api.ts';
import { PRELOAD_API_KEY } from '../preload/index.ts';

declare global {
  interface Window {
    [PRELOAD_API_KEY]: DesktopApi;
  }
}

declare module '*.mjs';

export {};
